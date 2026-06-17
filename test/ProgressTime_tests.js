/**
* Unit tests for Fable Progress Time
*
* @license     MIT
*
* @author      Steven Velozo <steven@velozo.com>
*/

var libFable = require('../source/Fable.js');

var Chai = require("chai");
var Expect = Chai.expect;

suite
(
	'Progress Time Tests',
	function()
	{
		suite
		(
			'Basic Timetamps',
			function()
			{
				test
				(
					'Basic progress time object tests',
					function(fDone)
					{
						let testFable = new libFable();
						Expect(testFable.ProgressTime).to.be.an('object');
						Expect(testFable.ProgressTime).to.have.property('createTimeStamp');
						return fDone();
					}
				);
				test
				(
					'Basic progress time operations (without hashes)',
					function(fDone)
					{
						let testFable = new libFable();
						Expect(testFable.ProgressTime.getTimeStampDelta()).to.equal(-1);
						testFable.ProgressTime.createTimeStamp();
						Expect(testFable.ProgressTime.timeStamps.Default).to.be.greaterThan(0);
						return fDone();
					}
				);
				test
				(
					'Basic progress time operations (with and without hashes)',
					function(fDone)
					{
						let testFable = new libFable();
						Expect(testFable.ProgressTime.getTimeStampDelta()).to.equal(-1);
						testFable.ProgressTime.createTimeStamp();
						Expect(testFable.ProgressTime.timeStamps.Default).to.be.greaterThan(0);
						testFable.ProgressTime.createTimeStamp('TestHash');
						Expect(testFable.ProgressTime.getTimeStampValue('TestHash')).to.be.greaterThan(0);
						Expect(testFable.ProgressTime.timeStamps.TestHash).to.be.greaterThan(0);
						testFable.ProgressTime.removeTimeStamp('TestHash');
						Expect(testFable.ProgressTime.timeStamps.TestHash).to.be.undefined;
						Expect(testFable.ProgressTime.getTimeStampValue('TestHash')).to.be.lessThan(0);
						return fDone();
					}
				);
				test
				(
					'Basic progress time logging operations (without hashes)',
					function(fDone)
					{
						let testFable = new libFable();

						testFable.ProgressTime.createTimeStamp();

						setTimeout(
							() =>
							{
								let tmpTimeDelta = testFable.ProgressTime.getTimeStampDelta();
								Expect(tmpTimeDelta).to.be.greaterThan(90);
								Expect(testFable.ProgressTime.getTimeStampDeltaMessage(tmpTimeDelta)).to.be.a('string');
								testFable.ProgressTime.logTimeStampDelta();
								return fDone();
							}, 100
						)
					}
				);
				test
				(
					'Basic progress time logging operations (with hashes)',
					function(fDone)
					{
						let testFable = new libFable();

						testFable.ProgressTime.createTimeStamp('IntegrationOperation');

						setTimeout(
							() =>
							{
								testFable.ProgressTime.createTimeStamp('SubPushOperation');
								Expect(testFable.ProgressTime.getTimeStampDelta('SubPushOperation')).to.be.lessThan(20);
								Expect(testFable.ProgressTime.getTimeStampDelta('IntegrationOperation')).to.be.greaterThan(20);
								Expect(testFable.ProgressTime.getDurationBetweenTimestamps('IntegrationOperation', 'SubPushOperation')).to.be.greaterThan(20);
								return fDone();
							}, 50
						)
					}
				);
			}
		);
	}
);