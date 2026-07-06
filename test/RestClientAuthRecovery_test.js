/**
* Unit tests for the Fable RestClient authenticationRecovery hook.
*
* A completed 401, with a recovery hook installed, on a request that is not
* itself a replay, awaits the hook and -- on a truthy resolution -- replays the
* original request exactly once. These tests stand up a throwaway local HTTP
* server so they need no network and no external fixtures.
*
* @license     MIT
*
* @author      Steven Velozo <steven@velozo.com>
*/

var libFable = require('../source/Fable.js');
var libHTTP = require('http');

var Chai = require("chai");
var Expect = Chai.expect;

// Stand up a tiny HTTP server whose auth behavior the test drives via a shared
// state object. `Authed` gates the response: 401 while false, 200 (JSON) while
// true. `Requests` records every hit so we can assert replay counts.
function createGatedServer(pState, fReady)
{
	let tmpServer = libHTTP.createServer(
		(pRequest, pResponse) =>
		{
			pState.Requests.push({ url: pRequest.url, method: pRequest.method });
			// Drain the body so keep-alive sockets are reusable across the replay.
			pRequest.on('data', () => {});
			pRequest.on('end', () =>
			{
				if (pState.Authed)
				{
					pResponse.writeHead(200, { 'Content-Type': 'application/json' });
					pResponse.end(JSON.stringify({ OK: true, Hits: pState.Requests.length }));
				}
				else
				{
					pResponse.writeHead(401, { 'Content-Type': 'application/json' });
					pResponse.end(JSON.stringify({ Error: 'Authentication required.' }));
				}
			});
		});
	tmpServer.listen(0, '127.0.0.1', () => { fReady(tmpServer, tmpServer.address().port); });
}

function makeClient()
{
	let tmpFable = new libFable();
	return tmpFable.instantiateServiceProvider('RestClient', {}, 'RestClient-AuthRecovery');
}

suite
	(
		'Fable RestClient Auth Recovery',
		function ()
		{
			test
				(
					'401 -> recovery true -> replay -> 200',
					function (fTestComplete)
					{
						let tmpState = { Authed: false, Requests: [] };
						createGatedServer(tmpState,
							(pServer, pPort) =>
							{
								let tmpRestClient = makeClient();
								let tmpRecoveryCalls = 0;
								// The hook "signs in": flip the server to authed, as a real
								// re-auth modal would refresh the cookie out of band.
								tmpRestClient.authenticationRecovery = () =>
								{
									tmpRecoveryCalls++;
									tmpState.Authed = true;
									return Promise.resolve(true);
								};
								tmpRestClient.getJSON({ url: `http://127.0.0.1:${pPort}/gated` },
									(pError, pResponse, pBody) =>
									{
										Expect(pResponse.statusCode).to.equal(200);
										Expect(pBody.OK).to.equal(true);
										Expect(tmpRecoveryCalls).to.equal(1);
										// Exactly two hits: the original 401 and the single replay.
										Expect(tmpState.Requests.length).to.equal(2);
										pServer.close(() => fTestComplete());
									});
							});
					}
				);

			test
				(
					'401 -> recovery false -> original 401 passes through',
					function (fTestComplete)
					{
						let tmpState = { Authed: false, Requests: [] };
						createGatedServer(tmpState,
							(pServer, pPort) =>
							{
								let tmpRestClient = makeClient();
								let tmpRecoveryCalls = 0;
								tmpRestClient.authenticationRecovery = () =>
								{
									tmpRecoveryCalls++;
									return Promise.resolve(false);
								};
								tmpRestClient.getJSON({ url: `http://127.0.0.1:${pPort}/gated` },
									(pError, pResponse, pBody) =>
									{
										Expect(pResponse.statusCode).to.equal(401);
										Expect(pBody.Error).to.be.a('string');
										Expect(tmpRecoveryCalls).to.equal(1);
										// No replay: a single request only.
										Expect(tmpState.Requests.length).to.equal(1);
										pServer.close(() => fTestComplete());
									});
							});
					}
				);

			test
				(
					'No hook installed -> 401 returned unchanged, no recovery',
					function (fTestComplete)
					{
						let tmpState = { Authed: false, Requests: [] };
						createGatedServer(tmpState,
							(pServer, pPort) =>
							{
								let tmpRestClient = makeClient();
								// authenticationRecovery defaults to null.
								Expect(tmpRestClient.authenticationRecovery).to.equal(null);
								tmpRestClient.getJSON({ url: `http://127.0.0.1:${pPort}/gated` },
									(pError, pResponse, pBody) =>
									{
										Expect(pResponse.statusCode).to.equal(401);
										Expect(tmpState.Requests.length).to.equal(1);
										pServer.close(() => fTestComplete());
									});
							});
					}
				);

			test
				(
					'One-retry cap: recovery true but still 401 -> no infinite loop',
					function (fTestComplete)
					{
						// Server stays unauthed forever; the hook keeps saying "recovered".
						let tmpState = { Authed: false, Requests: [] };
						createGatedServer(tmpState,
							(pServer, pPort) =>
							{
								let tmpRestClient = makeClient();
								let tmpRecoveryCalls = 0;
								tmpRestClient.authenticationRecovery = () =>
								{
									tmpRecoveryCalls++;
									return Promise.resolve(true);
								};
								tmpRestClient.getJSON({ url: `http://127.0.0.1:${pPort}/gated` },
									(pError, pResponse, pBody) =>
									{
										Expect(pResponse.statusCode).to.equal(401);
										// Recovery fired once; the replay was marked and could
										// not re-enter recovery -> exactly two requests total.
										Expect(tmpRecoveryCalls).to.equal(1);
										Expect(tmpState.Requests.length).to.equal(2);
										pServer.close(() => fTestComplete());
									});
							});
					}
				);

			test
				(
					'Single-flight: N concurrent 401s collapse to one recovery',
					function (fTestComplete)
					{
						let tmpState = { Authed: false, Requests: [] };
						createGatedServer(tmpState,
							(pServer, pPort) =>
							{
								let tmpRestClient = makeClient();
								let tmpRecoveryCalls = 0;
								// Delay the resolution so all N requests 401 and enter
								// recovery before the first one settles.
								tmpRestClient.authenticationRecovery = () =>
								{
									tmpRecoveryCalls++;
									return new Promise((fResolve) =>
									{
										setTimeout(() => { tmpState.Authed = true; fResolve(true); }, 40);
									});
								};

								let tmpTotal = 5;
								let tmpDone = 0;
								let tmpAll200 = true;
								for (let i = 0; i < tmpTotal; i++)
								{
									tmpRestClient.getJSON({ url: `http://127.0.0.1:${pPort}/gated?n=${i}` },
										(pError, pResponse, pBody) =>
										{
											if (!pResponse || pResponse.statusCode !== 200) { tmpAll200 = false; }
											tmpDone++;
											if (tmpDone === tmpTotal)
											{
												Expect(tmpAll200).to.equal(true);
												// One recovery for the whole burst...
												Expect(tmpRecoveryCalls).to.equal(1);
												// ...and each request hit once (401) then replayed once (200).
												Expect(tmpState.Requests.length).to.equal(tmpTotal * 2);
												pServer.close(() => fTestComplete());
											}
										});
								}
							});
					}
				);

			test
				(
					'Single-flight re-arms: a later expiry triggers a fresh recovery',
					function (fTestComplete)
					{
						let tmpState = { Authed: false, Requests: [] };
						createGatedServer(tmpState,
							(pServer, pPort) =>
							{
								let tmpRestClient = makeClient();
								let tmpRecoveryCalls = 0;
								tmpRestClient.authenticationRecovery = () =>
								{
									tmpRecoveryCalls++;
									tmpState.Authed = true;
									return Promise.resolve(true);
								};
								// First expiry recovers.
								tmpRestClient.getJSON({ url: `http://127.0.0.1:${pPort}/gated` },
									(pError, pResponse) =>
									{
										Expect(pResponse.statusCode).to.equal(200);
										Expect(tmpRecoveryCalls).to.equal(1);
										// Simulate a second, unrelated expiry.
										tmpState.Authed = false;
										tmpRestClient.getJSON({ url: `http://127.0.0.1:${pPort}/gated` },
											(pError2, pResponse2) =>
											{
												Expect(pResponse2.statusCode).to.equal(200);
												// The shared promise cleared on settle, so recovery
												// armed again for the new expiry.
												Expect(tmpRecoveryCalls).to.equal(2);
												pServer.close(() => fTestComplete());
											});
									});
							});
					}
				);

			test
				(
					'Recovery covers non-JSON chunked reads (getRawText)',
					function (fTestComplete)
					{
						let tmpState = { Authed: false, Requests: [] };
						createGatedServer(tmpState,
							(pServer, pPort) =>
							{
								let tmpRestClient = makeClient();
								tmpRestClient.authenticationRecovery = () =>
								{
									tmpState.Authed = true;
									return Promise.resolve(true);
								};
								tmpRestClient.getRawText({ url: `http://127.0.0.1:${pPort}/gated` },
									(pError, pResponse, pBody) =>
									{
										Expect(pResponse.statusCode).to.equal(200);
										Expect(pBody).to.be.a('string');
										Expect(tmpState.Requests.length).to.equal(2);
										pServer.close(() => fTestComplete());
									});
							});
					}
				);

			test
				(
					'Recovery covers binary uploads (executeBinaryUpload)',
					function (fTestComplete)
					{
						let tmpState = { Authed: false, Requests: [] };
						createGatedServer(tmpState,
							(pServer, pPort) =>
							{
								let tmpRestClient = makeClient();
								let tmpProgress = 0;
								tmpRestClient.authenticationRecovery = () =>
								{
									tmpState.Authed = true;
									return Promise.resolve(true);
								};
								tmpRestClient.executeBinaryUpload(
									{ url: `http://127.0.0.1:${pPort}/upload`, method: 'POST', body: Buffer.from('hello-bytes') },
									(pError, pResponse, pBody) =>
									{
										Expect(pResponse.statusCode).to.equal(200);
										// Both hits were POSTs carrying the body; replay re-sent it.
										Expect(tmpState.Requests.length).to.equal(2);
										Expect(tmpState.Requests[0].method).to.equal('POST');
										// Completion progress fired exactly once, on terminal delivery.
										Expect(tmpProgress).to.equal(1);
										pServer.close(() => fTestComplete());
									},
									(pFraction) => { if (pFraction === 1.0) { tmpProgress++; } });
							});
					}
				);
		}
	);
