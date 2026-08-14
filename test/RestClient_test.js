/**
* Unit tests for the Fable simple-get RestClient
*
* @license     MIT
*
* @author      Steven Velozo <steven@velozo.com>
*/

var libFable = require('../source/Fable.js');
var libHTTP = require('http');

var Chai = require("chai");
var Expect = Chai.expect;

// https://en.wiktionary.org/w/api.php?action=parse&prop=wikitext&format=json&page=dog

suite
	(
		'Fable RestClient',
		function ()
		{
			setup
				(
					function () { }
				);

			suite
				(
					'Basic Requests',
					function ()
					{
						test
							(
								'Perform a POST request.',
								function (fTestComplete)
								{
									let testFable = new libFable();
									// Instantiate the RestClient Service Provider
									let tmpRestClient = testFable.instantiateServiceProvider('RestClient', { TraceLog: true }, 'RestClient-99');

									tmpRestClient.prepareRequestOptions = (pOptions) =>
									{
										pOptions.headers = { 'Content-Type': 'application/json' };
										return pOptions;
									};

									// Download the wiktionary entry for dog!
									tmpRestClient.postJSON({ url: 'http://localhost:8086/1.0/Author', body: { Name: 'Test Author' } },
										(pError, pResponse, pBody) =>
										{
											Expect(pBody).to.be.an('object');
											Expect(pBody.hasOwnProperty('Name')).to.equal(true);
											Expect(pBody.Name).to.equal('Test Author');
											fTestComplete();
										});
								}
							);
						test
							(
								'Perform a GET request.',
								function (fTestComplete)
								{
									let testFable = new libFable();
									// Instantiate the RestClient Service Provider
									testFable.instantiateServiceProvider('RestClient', { TraceLog: true });

									// Download the wiktionary entry for dog!
									testFable.RestClient.getJSON('http://localhost:8086/1.0/Author/1',
										(pError, pResponse, pBody) =>
										{
											Expect(pBody).to.be.an('object');
											Expect(pBody.hasOwnProperty('Name')).to.equal(true);
											Expect(pBody.Name).to.be.a('string');
											Expect(pBody.Name.length).to.be.greaterThan(0);
											fTestComplete();
										});
								}
							);
						test
							(
								'Get a binary file.',
								function (fTestComplete)
								{
									let testFable = new libFable();
									// Instantiate the RestClient Service Provider
									let tmpRestClient = testFable.instantiateServiceProvider('RestClient', { TraceLog: true }, 'RestClient-99');

									// Download the wiktionary entry for dog!
									tmpRestClient.executeChunkedRequestBinary({ url: 'http://localhost:8086/1.0/Author/1', method: 'GET' },
										(pError, pResponse, pBuffer) =>
										{
											Expect(pBuffer).to.be.instanceof(Buffer);
											testFable.instantiateServiceProvider('FilePersistence');
											// TODO: How to test this on all operating systems safely?
											//testFable.FilePersistence.writeFileSync(`/tmp/RestClient_binary_test.jpg`, pBuffer);
											fTestComplete();
										});
								}
							);
						test
							(
								'Perform a PUT request.',
								function (fTestComplete)
								{
									let testFable = new libFable();
									// Instantiate the RestClient Service Provider
									let tmpRestClient = testFable.instantiateServiceProvider('RestClient', { TraceLog: true }, 'RestClient-99');

									// Download the wiktionary entry for dog!
									tmpRestClient.putJSON({ url: 'http://localhost:8086/1.0/Author/Upsert', body: { GUIDAuthor: 'TestAuthor', Name: 'Test Author 2' } },
										(pError, pResponse, pBody) =>
										{
											Expect(pBody).to.be.an('object');
											Expect(pBody.hasOwnProperty('Name')).to.equal(true);
											Expect(pBody.Name).to.equal('Test Author 2');
											fTestComplete();
										});
								}
							);
						test
							(
								'Perform an UPSERT request then a DELETE.',
								function (fTestComplete)
								{
									let testFable = new libFable();
									// Instantiate the RestClient Service Provider
									let tmpRestClient = testFable.instantiateServiceProvider('RestClient', { TraceLog: true }, 'RestClient-99');

									// Download the wiktionary entry for dog!
									tmpRestClient.putJSON({ url: 'http://localhost:8086/1.0/Author/Upsert', body: { Name: 'Test Author 2 DELETE' } },
										(pError, pResponse, pBody) =>
										{
											Expect(pBody).to.be.an('object');
											Expect(pBody.hasOwnProperty('Name')).to.equal(true);
											Expect(pBody.Name).to.equal('Test Author 2 DELETE');
											tmpRestClient.delJSON({ url: `http://localhost:8086/1.0/Author/${pBody.IDAuthor}` },
												(pDeleteError, pDeleteResponse, pDeleteBody) =>
												{
													Expect(pDeleteBody.Count)
														.to.equal(1);
													fTestComplete();
												});
										});
								}
							);
					}
				);

				suite
					(
						'HTTP Agent',
						function ()
						{
							test
								(
									'Always installs http/https agents, even when KeepAlive is not set.',
									function ()
									{
										// Without an explicit agent, requests would fall through to
										// http.globalAgent and hit the Node 20+ ~5s socket timeout.
										let testFable = new libFable();
										let tmpRestClient = testFable.instantiateServiceProvider('RestClient', {}, 'RestClient-DefaultAgent');

										Expect(tmpRestClient.httpAgent).to.be.an('object');
										Expect(tmpRestClient.httpsAgent).to.be.an('object');
										Expect(Boolean(tmpRestClient.httpAgent.keepAlive)).to.equal(false);
										Expect(Boolean(tmpRestClient.httpsAgent.keepAlive)).to.equal(false);
									}
								);
							test
								(
									'Enables keepAlive on agents when KeepAlive option is set.',
									function ()
									{
										let testFable = new libFable();
										let tmpRestClient = testFable.instantiateServiceProvider('RestClient', { KeepAlive: true }, 'RestClient-KeepAlive-Options');

										Expect(tmpRestClient.httpAgent.keepAlive).to.equal(true);
										Expect(tmpRestClient.httpsAgent.keepAlive).to.equal(true);
									}
								);
							test
								(
									'Enables keepAlive on agents via fable settings.',
									function ()
									{
										let testFable = new libFable({ RestClientKeepAlive: true });
										let tmpRestClient = testFable.instantiateServiceProvider('RestClient', {}, 'RestClient-KeepAlive-Settings');

										Expect(tmpRestClient.httpAgent.keepAlive).to.equal(true);
										Expect(tmpRestClient.httpsAgent.keepAlive).to.equal(true);
									}
								);
							test
								(
									'Passes additional agent options through KeepAliveAgentOptions.',
									function ()
									{
										let testFable = new libFable();
										let tmpRestClient = testFable.instantiateServiceProvider('RestClient',
											{
												KeepAlive: true,
												KeepAliveAgentOptions: { timeout: 300000, maxSockets: 32 }
											}, 'RestClient-KeepAlive-AgentOpts');

										Expect(tmpRestClient.httpAgent.keepAlive).to.equal(true);
										Expect(tmpRestClient.httpAgent.options.timeout).to.equal(300000);
										Expect(tmpRestClient.httpAgent.options.maxSockets).to.equal(32);
										Expect(tmpRestClient.httpsAgent.options.timeout).to.equal(300000);
									}
								);
							test
								(
									'KeepAliveAgentOptions apply even when KeepAlive is not enabled.',
									function ()
									{
										// Tuning options still flow through when keepAlive is off.
										let testFable = new libFable();
										let tmpRestClient = testFable.instantiateServiceProvider('RestClient',
											{ KeepAliveAgentOptions: { maxSockets: 8 } }, 'RestClient-AgentOpts-NoKeepAlive');

										Expect(Boolean(tmpRestClient.httpAgent.keepAlive)).to.equal(false);
										Expect(tmpRestClient.httpAgent.options.maxSockets).to.equal(8);
									}
								);
							test
								(
									'Injects the http agent on http:// URLs.',
									function (fTestComplete)
									{
										var tmpServer = libHTTP.createServer(function (pReq, pRes)
										{
											pRes.writeHead(200, { 'Content-Type': 'application/json' });
											pRes.end(JSON.stringify({ OK: true }));
										});

										tmpServer.listen(0, function ()
										{
											var tmpPort = tmpServer.address().port;
											var testFable = new libFable();
											var tmpRestClient = testFable.instantiateServiceProvider('RestClient', {}, 'RestClient-AgentInject-HTTP');

											var tmpOriginalPrepare = tmpRestClient.prepareRequestOptions;
											var tmpCapturedAgent = null;
											tmpRestClient.prepareRequestOptions = function (pOptions)
											{
												let tmpResult = tmpOriginalPrepare(pOptions);
												tmpCapturedAgent = tmpResult.agent;
												return tmpResult;
											};

											tmpRestClient.getJSON('http://localhost:' + tmpPort + '/test',
												function (pError, pResponse, pBody)
												{
													Expect(tmpCapturedAgent).to.equal(tmpRestClient.httpAgent);
													Expect(pBody.OK).to.equal(true);
													tmpServer.close();
													fTestComplete();
												});
										});
									}
								);
							test
								(
									'Selects the https agent for https:// URLs.',
									function ()
									{
										// We don't need a live HTTPS server to verify the selection
										// logic — invoke prepareRequestOptions directly and inspect
										// which agent was chosen.
										let testFable = new libFable();
										let tmpRestClient = testFable.instantiateServiceProvider('RestClient', {}, 'RestClient-AgentInject-HTTPS');

										let tmpHttps = tmpRestClient.prepareRequestOptions({ url: 'https://example.com/x' });
										let tmpHttp = tmpRestClient.prepareRequestOptions({ url: 'http://example.com/x' });

										Expect(tmpHttps.agent).to.equal(tmpRestClient.httpsAgent);
										Expect(tmpHttp.agent).to.equal(tmpRestClient.httpAgent);
									}
								);
							test
								(
									'Selects the http agent for relative URLs and option objects without a URL.',
									function ()
									{
										// simple-get's protocol decision is `opts.protocol === 'https:'
										// ? https : http`, so a URL with no protocol — including a
										// relative path or a pre-parsed options object — routes through
										// the http module. The agent we stamp on must match, otherwise
										// Node throws ERR_INVALID_PROTOCOL on dispatch.
										let testFable = new libFable();
										let tmpRestClient = testFable.instantiateServiceProvider('RestClient', {}, 'RestClient-AgentInject-Relative');

										let tmpRelative = tmpRestClient.prepareRequestOptions({ url: '/1.0/Users/Count' });
										let tmpNoUrl = tmpRestClient.prepareRequestOptions({ hostname: 'localhost', port: 8086, path: '/1.0/Users' });

										Expect(tmpRelative.agent).to.equal(tmpRestClient.httpAgent);
										Expect(tmpNoUrl.agent).to.equal(tmpRestClient.httpAgent);
									}
								);
							test
								(
									'A relative URL is dispatched without throwing ERR_INVALID_PROTOCOL.',
									function (fTestComplete)
									{
										// End-to-end regression: before the fix, fable stamped the
										// httpsAgent on relative URLs while simple-get routed them
										// through http.request, which made Node throw synchronously.
										// We point fable at a real http server via RestClientURLPrefix
										// so the relative URL becomes resolvable, and assert that the
										// request completes (rather than throwing on dispatch).
										var tmpServer = libHTTP.createServer(function (pReq, pRes)
										{
											pRes.writeHead(200, { 'Content-Type': 'application/json' });
											pRes.end(JSON.stringify({ Path: pReq.url }));
										});

										tmpServer.listen(0, function ()
										{
											var tmpPort = tmpServer.address().port;
											var testFable = new libFable({ RestClientURLPrefix: 'http://localhost:' + tmpPort });
											var tmpRestClient = testFable.instantiateServiceProvider('RestClient', {}, 'RestClient-RelativeURL-Dispatch');

											var tmpOriginalPrepare = tmpRestClient.prepareRequestOptions;
											var tmpCapturedAgent = null;
											tmpRestClient.prepareRequestOptions = function (pOptions)
											{
												let tmpResult = tmpOriginalPrepare(pOptions);
												if (tmpCapturedAgent === null)
												{
													tmpCapturedAgent = tmpResult.agent;
												}
												return tmpResult;
											};

											tmpRestClient.getJSON('/relative/path',
												function (pError, pResponse, pBody)
												{
													Expect(pError).to.equal(null);
													Expect(tmpCapturedAgent).to.equal(tmpRestClient.httpAgent);
													Expect(pBody.Path).to.equal('/relative/path');
													tmpServer.close();
													fTestComplete();
												});
										});
									}
								);
							test
								(
									'Chains with previously set prepareRequestOptions.',
									function (fTestComplete)
									{
										var tmpServer = libHTTP.createServer(function (pReq, pRes)
										{
											pRes.writeHead(200, { 'Content-Type': 'application/json' });
											pRes.end(JSON.stringify({ CustomHeader: pReq.headers['x-custom'] || '' }));
										});

										tmpServer.listen(0, function ()
										{
											var tmpPort = tmpServer.address().port;
											var testFable = new libFable();
											var tmpRestClient = testFable.instantiateServiceProvider('RestClient', { KeepAlive: true }, 'RestClient-KeepAlive-Chain');

											var tmpInstalledPrepare = tmpRestClient.prepareRequestOptions;
											tmpRestClient.prepareRequestOptions = function (pOptions)
											{
												let tmpResult = tmpInstalledPrepare(pOptions);
												if (!tmpResult.headers)
												{
													tmpResult.headers = {};
												}
												tmpResult.headers['X-Custom'] = 'test-value';
												return tmpResult;
											};

											tmpRestClient.getJSON('http://localhost:' + tmpPort + '/test',
												function (pError, pResponse, pBody)
												{
													Expect(pBody.CustomHeader).to.equal('test-value');
													tmpServer.close();
													fTestComplete();
												});
										});
									}
								);
							test
								(
									'initializeKeepAliveAgent remains a back-compat entry point.',
									function ()
									{
										let testFable = new libFable();
										let tmpRestClient = testFable.instantiateServiceProvider('RestClient', {}, 'RestClient-BackCompat');

										// Default constructor: no keepAlive
										Expect(Boolean(tmpRestClient.httpAgent.keepAlive)).to.equal(false);

										// Calling the legacy method flips keepAlive on
										tmpRestClient.initializeKeepAliveAgent({ maxSockets: 4 });
										Expect(tmpRestClient.httpAgent.keepAlive).to.equal(true);
										Expect(tmpRestClient.httpAgent.options.maxSockets).to.equal(4);
									}
								);
						}
					);

				suite
					(
						'Request Timeout',
						function ()
						{
							// Helper: spin up a local HTTP server that never responds so we can
							// verify that the simple-get 'Request timed out' path fires on our
							// configured timeout rather than any ambient http.globalAgent default.
							var createHangingServer = function (fOnListen)
							{
								var tmpServer = libHTTP.createServer(function (pReq, pRes)
								{
									// Intentionally never write or end the response
								});
								tmpServer.listen(0, function ()
								{
									fOnListen(tmpServer, tmpServer.address().port);
								});
								return tmpServer;
							};

							test
								(
									'Applies the library default timeout (60000ms) when none is supplied.',
									function ()
									{
										let testFable = new libFable();
										let tmpRestClient = testFable.instantiateServiceProvider('RestClient', {}, 'RestClient-DefaultTimeout');

										Expect(tmpRestClient.defaultRequestTimeout).to.equal(60000);

										let tmpPrepared = tmpRestClient.preRequest({ url: 'http://example.com/x', method: 'GET' });
										Expect(tmpPrepared.timeout).to.equal(60000);
									}
								);
							test
								(
									'RequestTimeout constructor option overrides the library default.',
									function ()
									{
										let testFable = new libFable();
										let tmpRestClient = testFable.instantiateServiceProvider('RestClient', { RequestTimeout: 60000 }, 'RestClient-OptTimeout');

										Expect(tmpRestClient.defaultRequestTimeout).to.equal(60000);

										let tmpPrepared = tmpRestClient.preRequest({ url: 'http://example.com/x', method: 'GET' });
										Expect(tmpPrepared.timeout).to.equal(60000);
									}
								);
							test
								(
									'RestClientRequestTimeout fable setting overrides the library default.',
									function ()
									{
										let testFable = new libFable({ RestClientRequestTimeout: 45000 });
										let tmpRestClient = testFable.instantiateServiceProvider('RestClient', {}, 'RestClient-SettingTimeout');

										Expect(tmpRestClient.defaultRequestTimeout).to.equal(45000);
									}
								);
							test
								(
									'Constructor option takes precedence over fable setting.',
									function ()
									{
										let testFable = new libFable({ RestClientRequestTimeout: 45000 });
										let tmpRestClient = testFable.instantiateServiceProvider('RestClient', { RequestTimeout: 15000 }, 'RestClient-TimeoutPrecedence');

										Expect(tmpRestClient.defaultRequestTimeout).to.equal(15000);
									}
								);
							test
								(
									'Caller-supplied timeout on the request options is preserved.',
									function ()
									{
										let testFable = new libFable();
										let tmpRestClient = testFable.instantiateServiceProvider('RestClient', {}, 'RestClient-CallerTimeout');

										let tmpPrepared = tmpRestClient.preRequest({ url: 'http://example.com/x', method: 'GET', timeout: 1234 });
										Expect(tmpPrepared.timeout).to.equal(1234);
									}
								);
							test
								(
									'Explicit timeout of 0 on the request options is preserved.',
									function ()
									{
										// 0 is a valid numeric value — it signals "override the mystery
										// default with no timeout" and must not be replaced.
										let testFable = new libFable();
										let tmpRestClient = testFable.instantiateServiceProvider('RestClient', {}, 'RestClient-ZeroTimeout');

										let tmpPrepared = tmpRestClient.preRequest({ url: 'http://example.com/x', method: 'GET', timeout: 0 });
										Expect(tmpPrepared.timeout).to.equal(0);
									}
								);
							test
								(
									'RequestTimeout value of 0 is honored.',
									function ()
									{
										let testFable = new libFable();
										let tmpRestClient = testFable.instantiateServiceProvider('RestClient', { RequestTimeout: 0 }, 'RestClient-ZeroOptTimeout');

										Expect(tmpRestClient.defaultRequestTimeout).to.equal(0);

										let tmpPrepared = tmpRestClient.preRequest({ url: 'http://example.com/x', method: 'GET' });
										Expect(tmpPrepared.timeout).to.equal(0);
									}
								);
							test
								(
									'A short RequestTimeout actually aborts a hanging request.',
									function (fTestComplete)
									{
										this.timeout(5000);
										var tmpServer;
										tmpServer = createHangingServer(function (pServer, pPort)
										{
											var testFable = new libFable();
											var tmpRestClient = testFable.instantiateServiceProvider('RestClient', { RequestTimeout: 300 }, 'RestClient-LiveTimeout');

											var tmpStart = Date.now();
											tmpRestClient.getJSON('http://localhost:' + pPort + '/hangs',
												function (pError, pResponse, pBody)
												{
													var tmpElapsed = Date.now() - tmpStart;
													Expect(pError).to.be.an.instanceof(Error);
													Expect(pError.message).to.contain('timed out');
													// Guard against the Node 20+ ~5s globalAgent timeout
													// silently beating our 300ms setting.
													Expect(tmpElapsed).to.be.lessThan(2500);
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
						'Redirect Following',
						function ()
						{
							test
								(
									'Follows a basic 301 redirect end-to-end.',
									function (fTestComplete)
									{
										// Single server: /start returns 301 to /dest, /dest returns 200 + JSON.
										var tmpServer = libHTTP.createServer(function (pReq, pRes)
										{
											if (pReq.url === '/start')
											{
												pRes.writeHead(301, { Location: '/dest' });
												pRes.end();
												return;
											}
											pRes.writeHead(200, { 'Content-Type': 'application/json' });
											pRes.end(JSON.stringify({ Reached: pReq.url }));
										});
										tmpServer.listen(0, function ()
										{
											var tmpPort = tmpServer.address().port;
											var testFable = new libFable();
											var tmpRestClient = testFable.instantiateServiceProvider('RestClient', {}, 'RestClient-Redirect-Basic');
											tmpRestClient.getJSON('http://localhost:' + tmpPort + '/start',
												function (pError, pResponse, pBody)
												{
													Expect(pError).to.equal(null);
													Expect(pBody.Reached).to.equal('/dest');
													tmpServer.close();
													fTestComplete();
												});
										});
									}
								);
							test
								(
									'Re-picks the agent on a protocol-changing redirect.',
									function (fTestComplete)
									{
										// http server redirects to an https URL. We don't need the https
										// destination to be reachable — we just need to verify that
										// prepareRequestOptions runs again on the redirect target and
										// stamps the httpsAgent on the second hop.
										var tmpAssignedAgents = [];
										var tmpServer = libHTTP.createServer(function (pReq, pRes)
										{
											pRes.writeHead(302, { Location: 'https://nowhere.invalid/x' });
											pRes.end();
										});
										tmpServer.listen(0, function ()
										{
											var tmpPort = tmpServer.address().port;
											var testFable = new libFable();
											var tmpRestClient = testFable.instantiateServiceProvider('RestClient', {}, 'RestClient-Redirect-ProtoSwitch');

											var tmpOriginalPrepare = tmpRestClient.prepareRequestOptions;
											tmpRestClient.prepareRequestOptions = function (pOptions)
											{
												var tmpResult = tmpOriginalPrepare(pOptions);
												tmpAssignedAgents.push({ url: tmpResult.url, agent: tmpResult.agent });
												return tmpResult;
											};

											tmpRestClient.getJSON('http://localhost:' + tmpPort + '/start',
												function (pError)
												{
													// The second hop will fail (DNS lookup of nowhere.invalid)
													// but the agent re-pick must have already happened
													// before that — and crucially, must NOT have thrown
													// ERR_INVALID_PROTOCOL synchronously like the old code.
													Expect(tmpAssignedAgents.length).to.be.at.least(2);
													Expect(tmpAssignedAgents[0].agent).to.equal(tmpRestClient.httpAgent);
													Expect(tmpAssignedAgents[1].agent).to.equal(tmpRestClient.httpsAgent);
													Expect(tmpAssignedAgents[1].url).to.equal('https://nowhere.invalid/x');
													tmpServer.close();
													fTestComplete();
												});
										});
									}
								);
							test
								(
									'Bails with "too many redirects" when the budget is exceeded.',
									function (fTestComplete)
									{
										// Self-redirecting server. Cap at 3 hops so the test stays quick.
										var tmpServer = libHTTP.createServer(function (pReq, pRes)
										{
											pRes.writeHead(302, { Location: pReq.url });
											pRes.end();
										});
										tmpServer.listen(0, function ()
										{
											var tmpPort = tmpServer.address().port;
											var testFable = new libFable();
											var tmpRestClient = testFable.instantiateServiceProvider('RestClient', {}, 'RestClient-Redirect-Loop');
											tmpRestClient.getJSON({ url: 'http://localhost:' + tmpPort + '/loop', maxRedirects: 3 },
												function (pError)
												{
													Expect(pError).to.be.an.instanceof(Error);
													Expect(pError.message).to.equal('too many redirects');
													tmpServer.close();
													fTestComplete();
												});
										});
									}
								);
							test
								(
									'Drops cookie and authorization on cross-origin redirect.',
									function (fTestComplete)
									{
										// Two servers on different ports. We use 127.0.0.1 vs localhost
										// to make them count as different hostnames per
										// _parseHostname's URL-string check.
										var tmpReceivedAtA = null;
										var tmpReceivedAtB = null;
										var tmpServerB = libHTTP.createServer(function (pReq, pRes)
										{
											tmpReceivedAtB = pReq.headers;
											pRes.writeHead(200, { 'Content-Type': 'application/json' });
											pRes.end(JSON.stringify({ ok: true }));
										});
										tmpServerB.listen(0, function ()
										{
											var tmpPortB = tmpServerB.address().port;
											var tmpServerA = libHTTP.createServer(function (pReq, pRes)
											{
												tmpReceivedAtA = pReq.headers;
												pRes.writeHead(302, { Location: 'http://127.0.0.1:' + tmpPortB + '/dest' });
												pRes.end();
											});
											tmpServerA.listen(0, function ()
											{
												var tmpPortA = tmpServerA.address().port;
												var testFable = new libFable();
												var tmpRestClient = testFable.instantiateServiceProvider('RestClient', {}, 'RestClient-Redirect-CrossOrigin');
												tmpRestClient.getJSON({
													url: 'http://localhost:' + tmpPortA + '/start',
													headers: { cookie: 'session=abc', authorization: 'Bearer xyz' }
												},
												function (pError, pResponse, pBody)
												{
													Expect(pError).to.equal(null);
													Expect(pBody.ok).to.equal(true);
													Expect(tmpReceivedAtA.cookie).to.equal('session=abc');
													Expect(tmpReceivedAtA.authorization).to.equal('Bearer xyz');
													Expect(tmpReceivedAtB.cookie).to.equal(undefined);
													Expect(tmpReceivedAtB.authorization).to.equal(undefined);
													tmpServerA.close();
													tmpServerB.close();
													fTestComplete();
												});
											});
										});
									}
								);
							test
								(
									'Converts POST to GET on a 301/302 redirect and drops the body.',
									function (fTestComplete)
									{
										var tmpDestRequest = null;
										var tmpServer = libHTTP.createServer(function (pReq, pRes)
										{
											if (pReq.url === '/start')
											{
												pRes.writeHead(301, { Location: '/dest' });
												pRes.end();
												return;
											}
											tmpDestRequest = { method: pReq.method, headers: pReq.headers };
											var tmpBody = '';
											pReq.on('data', function (pChunk) { tmpBody += pChunk; });
											pReq.on('end', function ()
											{
												tmpDestRequest.body = tmpBody;
												pRes.writeHead(200, { 'Content-Type': 'application/json' });
												pRes.end(JSON.stringify({ ok: true }));
											});
										});
										tmpServer.listen(0, function ()
										{
											var tmpPort = tmpServer.address().port;
											var testFable = new libFable();
											var tmpRestClient = testFable.instantiateServiceProvider('RestClient', {}, 'RestClient-Redirect-PostToGet');
											tmpRestClient.postJSON({ url: 'http://localhost:' + tmpPort + '/start', body: { foo: 'bar' } },
												function (pError, pResponse, pBody)
												{
													Expect(pError).to.equal(null);
													Expect(pBody.ok).to.equal(true);
													Expect(tmpDestRequest.method).to.equal('GET');
													Expect(tmpDestRequest.body).to.equal('');
													Expect(tmpDestRequest.headers['content-type']).to.equal(undefined);
													Expect(tmpDestRequest.headers['content-length']).to.equal(undefined);
													tmpServer.close();
													fTestComplete();
												});
										});
									}
								);
							test
								(
									'Resolves a relative Location header against the current URL.',
									function (fTestComplete)
									{
										// Server returns a relative Location ("dest" instead of "/dest").
										// RFC 7231 allows this; the next hop's URL must be resolved
										// against the URL that produced the redirect.
										var tmpDestRequestURL = null;
										var tmpServer = libHTTP.createServer(function (pReq, pRes)
										{
											if (pReq.url === '/section/start')
											{
												pRes.writeHead(302, { Location: 'dest' });
												pRes.end();
												return;
											}
											tmpDestRequestURL = pReq.url;
											pRes.writeHead(200, { 'Content-Type': 'application/json' });
											pRes.end(JSON.stringify({ ok: true }));
										});
										tmpServer.listen(0, function ()
										{
											var tmpPort = tmpServer.address().port;
											var testFable = new libFable();
											var tmpRestClient = testFable.instantiateServiceProvider('RestClient', {}, 'RestClient-Redirect-RelativeLocation');
											tmpRestClient.getJSON('http://localhost:' + tmpPort + '/section/start',
												function (pError, pResponse, pBody)
												{
													Expect(pError).to.equal(null);
													Expect(pBody.ok).to.equal(true);
													Expect(tmpDestRequestURL).to.equal('/section/dest');
													tmpServer.close();
													fTestComplete();
												});
										});
									}
								);
							test
								(
									'Honors followRedirects: false by handing the 3xx straight back.',
									function (fTestComplete)
									{
										// When the caller opts out, we shouldn't follow the redirect —
										// the JSON parser will fail because the 3xx body is empty,
										// which is the expected pre-fix behavior.
										var tmpServer = libHTTP.createServer(function (pReq, pRes)
										{
											pRes.writeHead(302, { Location: '/dest' });
											pRes.end();
										});
										tmpServer.listen(0, function ()
										{
											var tmpPort = tmpServer.address().port;
											var testFable = new libFable();
											var tmpRestClient = testFable.instantiateServiceProvider('RestClient', {}, 'RestClient-Redirect-OptOut');
											tmpRestClient.getJSON({ url: 'http://localhost:' + tmpPort + '/start', followRedirects: false },
												function (pError, pResponse)
												{
													Expect(pResponse.statusCode).to.equal(302);
													Expect(pResponse.headers.location).to.equal('/dest');
													tmpServer.close();
													fTestComplete();
												});
										});
									}
								);
						}
					);

				suite
					(
						'Error Handling',
						function ()
						{
							test
								(
									'Handle a non-JSON response without crashing.',
									function (fTestComplete)
									{
										// Spin up a tiny HTTP server that returns plain text with a 414 status
										var tmpServer = libHTTP.createServer(function (pReq, pRes)
										{
											pRes.writeHead(414, { 'Content-Type': 'text/plain' });
											pRes.end('URI too long\n');
										});

										tmpServer.listen(0, function ()
										{
											var tmpPort = tmpServer.address().port;
											var testFable = new libFable();
											var tmpRestClient = testFable.instantiateServiceProvider('RestClient', {}, 'RestClient-ErrorTest');

											tmpRestClient.getJSON('http://localhost:' + tmpPort + '/anything',
												function (pError, pResponse, pBody)
												{
													Expect(pError).to.be.an.instanceof(Error);
													Expect(pError.message).to.contain('414');
													Expect(pError.message).to.contain('URI too long');
													Expect(pBody).to.equal(null);
													tmpServer.close();
													fTestComplete();
												});
										});
									}
								);
						}
					);

			suite
				(
					'Bodyless Responses',
					function ()
					{
						test
							(
								'A 204 with no body is delivered as a null body, not a parse failure.',
								function (fTestComplete)
								{
									var tmpServer = libHTTP.createServer(
										function (pRequest, pResponse) { pResponse.writeHead(204); pResponse.end(); });
									tmpServer.listen(0, '127.0.0.1',
										function ()
										{
											var testFable = new libFable();
											var tmpRestClient = testFable.instantiateServiceProvider('RestClient', {}, 'RestClient-NoContent');
											tmpRestClient.delJSON({ url: 'http://127.0.0.1:' + tmpServer.address().port + '/Widget/1' },
												function (pError, pResponse, pBody)
												{
													Expect(pError).to.equal(null);
													Expect(pResponse.statusCode).to.equal(204);
													Expect(pBody).to.equal(null);
													tmpServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'An empty body on a 200 is still a parse failure.',
								function (fTestComplete)
								{
									// The 204 allowance is deliberately narrow -- an empty
									// 200 means a truncated or misbehaving response.
									var tmpServer = libHTTP.createServer(
										function (pRequest, pResponse) { pResponse.writeHead(200); pResponse.end(); });
									tmpServer.listen(0, '127.0.0.1',
										function ()
										{
											var testFable = new libFable();
											var tmpRestClient = testFable.instantiateServiceProvider('RestClient', {}, 'RestClient-EmptyOK');
											tmpRestClient.getJSON('http://127.0.0.1:' + tmpServer.address().port + '/Widget',
												function (pError, pResponse, pBody)
												{
													Expect(pError).to.be.an.instanceof(Error);
													Expect(pError.message).to.contain('JSON parse failed');
													Expect(pBody).to.equal(null);
													tmpServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'A HEAD request succeeds without a body on the options.',
								function (fTestComplete)
								{
									var tmpServer = libHTTP.createServer(
										function (pRequest, pResponse) { pResponse.writeHead(200, { 'X-Seen-Method': pRequest.method }); pResponse.end(); });
									tmpServer.listen(0, '127.0.0.1',
										function ()
										{
											var testFable = new libFable();
											var tmpRestClient = testFable.instantiateServiceProvider('RestClient', {}, 'RestClient-Head');
											tmpRestClient.headJSON({ url: 'http://127.0.0.1:' + tmpServer.address().port + '/Widget/1' },
												function (pError, pResponse, pBody)
												{
													Expect(pError).to.equal(null);
													Expect(pResponse.headers['x-seen-method']).to.equal('HEAD');
													Expect(pBody).to.equal(null);
													tmpServer.close();
													fTestComplete();
												});
										});
								}
							);
					}
				);

			suite
				(
					'Cookie Composition',
					function ()
					{
						test
							(
								'A cookie header supplied by the caller is not replaced by the service cookie.',
								function (fTestComplete)
								{
									// A forwarded caller identity has to survive on a client
									// that also carries its own bound session.
									var tmpServer = libHTTP.createServer(
										function (pRequest, pResponse)
										{
											pResponse.writeHead(200, { 'Content-Type': 'application/json' });
											pResponse.end(JSON.stringify({ Cookie: pRequest.headers.cookie || null }));
										});
									tmpServer.listen(0, '127.0.0.1',
										function ()
										{
											var testFable = new libFable();
											var tmpRestClient = testFable.instantiateServiceProvider('RestClient', {}, 'RestClient-CookieOverride');
											tmpRestClient.cookie = { UserSession: 'BOUND-MACHINE-SESSION' };
											tmpRestClient.getJSON(
												{
													url: 'http://127.0.0.1:' + tmpServer.address().port + '/Widget',
													headers: { cookie: 'UserSession=FORWARDED-CALLER' }
												},
												function (pError, pResponse, pBody)
												{
													Expect(pBody.Cookie).to.equal('UserSession=FORWARDED-CALLER');
													tmpServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'Every cookie in the jar is serialized, not just the first.',
								function (fTestComplete)
								{
									var tmpServer = libHTTP.createServer(
										function (pRequest, pResponse)
										{
											pResponse.writeHead(200, { 'Content-Type': 'application/json' });
											pResponse.end(JSON.stringify({ Cookie: pRequest.headers.cookie || null }));
										});
									tmpServer.listen(0, '127.0.0.1',
										function ()
										{
											var testFable = new libFable();
											var tmpRestClient = testFable.instantiateServiceProvider('RestClient', {}, 'RestClient-CookieJar');
											tmpRestClient.cookie = { SessionA: '111', SessionB: '222' };
											tmpRestClient.getJSON('http://127.0.0.1:' + tmpServer.address().port + '/Widget',
												function (pError, pResponse, pBody)
												{
													Expect(pBody.Cookie).to.contain('SessionA=111');
													Expect(pBody.Cookie).to.contain('SessionB=222');
													tmpServer.close();
													fTestComplete();
												});
										});
								}
							);
					}
				);

			suite
				(
					'URL Prefixing',
					function ()
					{
						test
							(
								'A relative URL receives the configured prefix.',
								function ()
								{
									var testFable = new libFable({ RestClientURLPrefix: 'https://api.example.com' });
									var tmpRestClient = testFable.instantiateServiceProvider('RestClient', {}, 'RestClient-PrefixRelative');
									var tmpOptions = tmpRestClient.preRequest({ url: '/1.0/Widget/1', method: 'GET' });
									Expect(tmpOptions.url).to.equal('https://api.example.com/1.0/Widget/1');
								}
							);

						test
							(
								'An already-absolute URL is left alone.',
								function ()
								{
									// A library layer that builds fully-qualified URLs must
									// not be corrupted by a host application's prefix.
									var testFable = new libFable({ RestClientURLPrefix: 'https://api.example.com' });
									var tmpRestClient = testFable.instantiateServiceProvider('RestClient', {}, 'RestClient-PrefixAbsolute');
									var tmpOptions = tmpRestClient.preRequest({ url: 'http://127.0.0.1:8086/1.0/Widget/1', method: 'GET' });
									Expect(tmpOptions.url).to.equal('http://127.0.0.1:8086/1.0/Widget/1');
								}
							);
					}
				);
		}
	);