/**
 * MOVINGAVERAGE — trailing running-average-of-N solver (Walbec HMA control
 * chart). Covers warm-up nulls, rounding, non-numeric handling, and the WI
 * "restart running average at any point" reset mechanism — direct on the Math
 * service AND end-to-end through the expression parser (as a dashboard solver).
 */
var libFable = require('../source/Fable.js');
var Chai = require('chai');
var Expect = Chai.expect;

function getHarness()
{
	let testFable = new libFable();
	return {
		fable: testFable,
		math: testFable.instantiateServiceProviderIfNotExists('Math'),
		parser: testFable.instantiateServiceProviderIfNotExists('ExpressionParser'),
		manifest: testFable.newManyfest()
	};
}

suite('MOVINGAVERAGE — direct (fable.Math.movingAverage)', function ()
{
	const math = getHarness().math;

	test('trailing-4: nulls during warm-up, then the moving average', function ()
	{
		Expect(math.movingAverage([ 1, 2, 3, 4, 5, 6 ], 4))
			.to.deep.equal([ null, null, null, '2.5', '3.5', '4.5' ]);
	});

	test('default window is 4 when omitted/invalid', function ()
	{
		Expect(math.movingAverage([ 1, 2, 3, 4, 5 ])).to.deep.equal([ null, null, null, '2.5', '3.5' ]);
		Expect(math.movingAverage([ 1, 2, 3, 4, 5 ], 'x')).to.deep.equal([ null, null, null, '2.5', '3.5' ]);
	});

	test('rounds to the requested decimals (half-up)', function ()
	{
		// window [1,2,3,5] = 11/4 = 2.75 -> 1 decimal -> 2.8
		Expect(math.movingAverage([ 1, 2, 3, 5 ], 4, 1)).to.deep.equal([ null, null, null, '2.8' ]);
	});

	test('handles numeric strings and respects precision', function ()
	{
		Expect(math.movingAverage([ '2.433', '2.431', '2.430', '2.428' ], 4, 3))
			.to.deep.equal([ null, null, null, '2.431' ]);
	});

	test('non-array input is returned unchanged', function ()
	{
		Expect(math.movingAverage(false, 4)).to.equal(false);
		Expect(math.movingAverage('nope', 4)).to.equal('nope');
	});

	test('a non-numeric value nulls only the windows that span it', function ()
	{
		// index 4 is non-numeric; windows touching it (i=4..7) are null, i=3 and i=8 compute
		const tmpOut = math.movingAverage([ 1, 2, 3, 4, 'x', 6, 7, 8, 9 ], 4);
		Expect(tmpOut[3]).to.equal('2.5');
		Expect(tmpOut[4]).to.equal(null);
		Expect(tmpOut[7]).to.equal(null);
		Expect(tmpOut[8]).to.equal('7.5'); // [6,7,8,9]/4
	});
});

suite('MOVINGAVERAGE — reset ("restart running average at any point")', function ()
{
	const math = getHarness().math;

	test('a reset flag restarts the window and re-triggers the warm-up', function ()
	{
		//                values:  1  2  3  4  5  6  7  8
		const tmpResets = [ 0, 0, 0, 0, 1, 0, 0, 0 ]; // restart at index 4
		Expect(math.movingAverage([ 1, 2, 3, 4, 5, 6, 7, 8 ], 4, undefined, tmpResets))
			//          i3=[1..4]=2.5 ; i4..i6 warm-up ; i7=[5,6,7,8]=6.5
			.to.deep.equal([ null, null, null, '2.5', null, null, null, '6.5' ]);
	});

	test('the window never reaches across a reset boundary', function ()
	{
		// reset at index 2; i=3,4 should average only within [2..]
		const tmpResets = [ 0, 0, 1, 0, 0 ];
		const tmpOut = math.movingAverage([ 10, 20, 1, 2, 3 ], 3, undefined, tmpResets);
		Expect(tmpOut[1]).to.equal(null);     // pre-reset warm-up
		Expect(tmpOut[3]).to.equal(null);     // only 2 points since reset (2 < window 3)
		Expect(tmpOut[4]).to.equal('2');      // [1,2,3]/3 = 2 — does NOT pull in the pre-reset 10/20
	});

	test('a reset at index 0 is a no-op', function ()
	{
		Expect(math.movingAverage([ 1, 2, 3, 4, 5 ], 4, undefined, [ 1, 0, 0, 0, 0 ]))
			.to.deep.equal([ null, null, null, '2.5', '3.5' ]);
	});

	test('multiple resets each start a fresh segment', function ()
	{
		const tmpResets = [ 0, 0, 1, 0, 1, 0, 0 ];
		// segments: [0,1] | [2,3] | [4,5,6]; window 2
		Expect(math.movingAverage([ 4, 6, 10, 20, 1, 3, 5 ], 2, undefined, tmpResets))
			.to.deep.equal([ null, '5', null, '15', null, '2', '4' ]);
	});
});

suite('MOVINGAVERAGE — through the expression parser (dashboard solver)', function ()
{
	test('MOVINGAVERAGE(Rows[].V, 4) — as a GlobalSolver would call it', function ()
	{
		const tmpHarness = getHarness();
		const tmpSource = { Rows: [ { V: '4.6' }, { V: '4.9' }, { V: '4.4' }, { V: '4.5' }, { V: '4.8' } ] };
		tmpHarness.parser.solve('RunAvg = MOVINGAVERAGE(Rows[].V, 4, 1)', tmpSource, {}, tmpHarness.manifest, tmpSource);
		// [4.6,4.9,4.4,4.5]=4.6 ; [4.9,4.4,4.5,4.8]=4.65 -> round1 -> 4.7 (half-up)
		Expect(tmpSource.RunAvg).to.deep.equal([ null, null, null, '4.6', '4.7' ]);
	});

	test('MOVINGAVERAGE(Rows[].V, 4, 1, Rows[].Reset) — reset column drives the restart', function ()
	{
		const tmpHarness = getHarness();
		const tmpSource = { Rows: [
			{ V: '1', Reset: '0' }, { V: '2', Reset: '0' }, { V: '3', Reset: '0' }, { V: '4', Reset: '0' },
			{ V: '9', Reset: '1' }, { V: '9', Reset: '0' }, { V: '9', Reset: '0' }, { V: '9', Reset: '0' } ] };
		tmpHarness.parser.solve('RunAvg = MOVINGAVERAGE(Rows[].V, 4, 1, Rows[].Reset)', tmpSource, {}, tmpHarness.manifest, tmpSource);
		Expect(tmpSource.RunAvg).to.deep.equal([ null, null, null, '2.5', null, null, null, '9' ]);
	});
});
