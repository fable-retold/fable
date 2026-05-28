/**
* Unit tests for Fable
*
* @license     MIT
*
* @author      Steven Velozo <steven@velozo.com>
*/

var libFable = require('../source/Fable.js');

var Chai = require("chai");
var Expect = Chai.expect;

class SimpleService extends libFable.ServiceProviderBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'SimpleService';
	}

	doSomething()
	{
		this.fable.log.info(`SimpleService ${this.UUID}::${this.Hash} is doing something.`);
	}
}

class MockDatabaseService extends libFable.ServiceProviderBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'MockDatabaseService';
	}

	connect()
	{
		this.fable.log.info(`MockDatabaseService ${this.UUID}::${this.Hash} is connecting to a database.`);
	}

	commit(pRecord)
	{
		this.fable.log.info(`MockDatabaseService ${this.UUID}::${this.Hash} is committing a record ${pRecord}.`);
	}
}

class MockCoreService extends libFable.CoreServiceProviderBase
{
	constructor(pOptions, pServiceHash)
	{
		super(pOptions, pServiceHash);

		this.serviceType = 'MockCoreService';
	}

	// Core services should be able to provide their behaviors before the Fable object is fully initialized.
	magicBehavior(pData)
	{
		console.log(`MockCoreService ${this.UUID}::${this.Hash} is doing something magical with ${pData}.`);
	}
}

suite
	(
		'Fable Service Manager',
		function ()
		{
			var testFable = false;

			setup
				(
					function ()
					{
					}
				);

			suite
				(
					'Service Manager',
					function ()
					{
						test
							(
								'Register a Service',
								function ()
								{
									testFable = new libFable();
									testFable.addServiceType('SimpleService');
									testFable.instantiateServiceProvider('SimpleService', { SomeOption: true }, 'SimpleService-123');

									Expect(testFable.servicesMap['SimpleService']['SimpleService-123']).to.be.an('object');
								}
							);
						test
							(
								'Register a Service with a custom innitialization routine',
								function ()
								{
									testFable = new libFable();
									testFable.addServiceType('SimpleService');
									testFable.extraServiceInitialization = (pService) =>
									{
										pService.MyFancyProperty = 'Fancy';
										return pService;
									}
									testFable.instantiateServiceProvider('SimpleService', { SomeOption: true }, 'TheBestOne');

									Expect(testFable.services.SimpleService).to.be.an('object');
									Expect(testFable.services.SimpleService.MyFancyProperty).to.equal('Fancy');
									Expect(testFable.servicesMap.SimpleService.TheBestOne.MyFancyProperty).to.equal('Fancy');
								}
							);
						test
							(
								'Use the Default Service',
								function ()
								{
									testFable = new libFable();
									testFable.addServiceType('SimpleService', SimpleService);
									testFable.instantiateServiceProvider('SimpleService', { SomeOption: true }, 'SimpleService-123');

									Expect(testFable.servicesMap['SimpleService']['SimpleService-123']).to.be.an('object');

									Expect(testFable.services['SimpleService']).to.be.an('object');

									testFable.services.SimpleService.doSomething();

									Expect(testFable.services['SimpleService'].Hash).to.equal('SimpleService-123');
								}
							);
						test
							(
								'Use the Default Service with a different hash',
								function ()
								{
									let testFable = new libFable({});

									testFable.addServiceType('SimpleService', SimpleService);

									testFable.instantiateServiceProvider('SimpleService', { SomeOption: true }, 'SimpleService-13');

									testFable.servicesMap['SimpleService']['SimpleService-13'].doSomething();

									Expect(testFable.servicesMap['SimpleService']['SimpleService-13']).to.be.an('object');
								}
							);

						test
							(
								'Instantiate a service without registering it to Fable',
								function ()
								{
									let testFable = new libFable({});

									testFable.addServiceType('SimpleService', SimpleService);

									let tmpService = testFable.instantiateServiceProviderWithoutRegistration('SimpleService', { SomeOption: true }, 'SimpleService-99');
									let tmpServiceFromPrototype = testFable.instantiateServiceProviderFromPrototype('SimpleService', { SomeOption: true }, 'SimpleService-100', SimpleService);

									Expect(testFable.servicesMap.SimpleService['SimpleService-99']).to.be.an('undefined');
									Expect(testFable.servicesMap.SimpleService['SimpleService-100']).to.be.an('object');
									Expect(tmpServiceFromPrototype).to.be.an('object');

									Expect(tmpService).to.be.an('object');
								}
							);
						test
							(
								'Add and instantiate a singleton service',
								function ()
								{
									let testFable = new libFable({});

									let tmpService = testFable.addAndInstantiateSingletonService('SimpleService', {}, SimpleService);

									Expect(testFable.SimpleService).to.be.an('object');
									Expect(tmpService).to.be.an('object');

									let tmpService2 = testFable.addAndInstantiateSingletonService('SimpleService', {}, SimpleService);

									// A second call should not construct another one.
									Expect(tmpService2.Hash).to.equal(tmpService.Hash);
								}
							);
						test
							(
								'addAndInstantiateSingletonService forwards options to the constructor',
								function ()
								{
									let testFable = new libFable({});

									let tmpService = testFable.addAndInstantiateSingletonService('SimpleService', { SomeOption: true }, SimpleService);

									Expect(tmpService.options.SomeOption).to.equal(true);
								}
							);
						test
							(
								'Change the default service provider',
								function ()
								{
									let testFable = new libFable({});

									testFable.addServiceType('SimpleService', SimpleService);
									testFable.addServiceType('DatabaseService', MockDatabaseService);

									testFable.instantiateServiceProvider('SimpleService', { SomeOption: true });
									testFable.services.SimpleService.doSomething();

									testFable.instantiateServiceProvider('DatabaseService', { ConnectionString: 'mongodb://localhost:27017/test' }, 'PrimaryConnection');

									Expect(testFable.services.DatabaseService.Hash).to.equal('PrimaryConnection');

									testFable.instantiateServiceProvider('DatabaseService', { ConnectionString: 'mongodb://localhost:27017/test' }, 'SecondaryConnection');

									Expect(testFable.services.DatabaseService.Hash).to.equal('PrimaryConnection');

									testFable.services.DatabaseService.connect();
									testFable.services.DatabaseService.commit('Test Record');

									testFable.setDefaultServiceInstantiation('DatabaseService', 'SecondaryConnection');

									testFable.services.DatabaseService.connect();
									testFable.services.DatabaseService.commit('Another Test Record');

									Expect(testFable.services.DatabaseService.Hash).to.equal('SecondaryConnection');
								}
							);

						test
							(
								'Construct a core service before Fable is initialized',
								function ()
								{
									let tmpCoreService = new MockCoreService({ SomeOption: true });

									Expect(tmpCoreService).to.be.an('object');

									tmpCoreService.magicBehavior('MAGICTESTDATA');
								}
							)
						test
							(
								'Construct a core service with a hash before Fable is initialized',
								function ()
								{
									let tmpCoreService = new MockCoreService({ SomeOption: true }, 'MockCoreService-1');

									Expect(tmpCoreService).to.be.an('object');
									Expect(tmpCoreService.Hash).to.equal('MockCoreService-1');

									tmpCoreService.magicBehavior('MAGICTESTDATA');
								}
							)

						test
							(
								'Construct a core service and attach it to Fable after Fable is initialized',
								function ()
								{

									let tmpCoreService = new MockCoreService({ SomeOption: true }, 'MockCoreService-2');

									Expect(tmpCoreService).to.be.an('object');
									Expect(tmpCoreService.Hash).to.equal('MockCoreService-2');

									let testFable = new libFable({});

									testFable.connectPreinitServiceProviderInstance(tmpCoreService);

									Expect(testFable.servicesMap.MockCoreService['MockCoreService-2']).to.be.an('object');
									Expect(testFable.services.MockCoreService).to.be.an('object');

									Expect(testFable.services.MockCoreService.fable.log).to.be.an('object');
								}
							)

						test
							(
								'Attempt to change the default service provider to a nonexistant provider',
								function ()
								{
									let testFable = new libFable({});

									testFable.addServiceType('SimpleService', SimpleService);
									testFable.addServiceType('DatabaseService', MockDatabaseService);

									testFable.instantiateServiceProvider('SimpleService', { SomeOption: true });
									testFable.services.SimpleService.doSomething();

									testFable.instantiateServiceProvider('DatabaseService', { ConnectionString: 'mongodb://localhost:27017/test' }, 'PrimaryConnection');

									Expect(testFable.services.DatabaseService.Hash).to.equal('PrimaryConnection');

									testFable.instantiateServiceProvider('DatabaseService', { ConnectionString: 'mongodb://localhost:27017/test' }, 'SecondaryConnection');

									Expect(testFable.services.DatabaseService.Hash).to.equal('PrimaryConnection');

									testFable.services.DatabaseService.connect();
									testFable.services.DatabaseService.commit('Test Record');

									Expect(testFable.setDefaultServiceInstantiation('DatabaseService', 'TertiaryConnection')).to.be.false;

									testFable.services.DatabaseService.connect();
									testFable.services.DatabaseService.commit('Another Test Record');

									Expect(testFable.services.DatabaseService.Hash).to.equal('PrimaryConnection');
								}
							);
					}
				);
		}
	);