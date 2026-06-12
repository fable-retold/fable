/**
 * AGGREGATIONJOINBYOBJECT, the fixed DISTRIBUTIONHISTOGRAM (plain sets),
 * and DATEFORMAT — including the end-to-end "per-group distinct count over
 * CSV set columns" composition that motivated them.
 */
var libFable = require('../source/Fable.js');
var Chai = require('chai');
var Expect = Chai.expect;

function getHarness()
{
	let testFable = new libFable();
	return { fable: testFable, parser: testFable.instantiateServiceProviderIfNotExists('ExpressionParser'), manifest: testFable.newManyfest() };
}

const LAKE_ROWS =
[
	{ BucketDate: '2026-06-01', Material: '4LT', IDDocuments: '900,901' },
	{ BucketDate: '2026-06-01', Material: '4MT', IDDocuments: '900,902' },
	{ BucketDate: '2026-06-02', Material: '4LT', IDDocuments: '903' }
];

suite('AGGREGATIONJOINBYOBJECT', function ()
{
	test('collects per-key values into joined strings, insertion-ordered', function ()
	{
		let tmpHarness = getHarness();
		let tmpSource = { RecordSubset: LAKE_ROWS };
		tmpHarness.parser.solve('ByDay = AGGREGATIONJOINBYOBJECT(RecordSubset, "BucketDate", "IDDocuments", ",")', tmpSource, {}, tmpHarness.manifest, tmpSource);
		Expect(tmpSource.ByDay).to.deep.equal({ '2026-06-01': '900,901,900,902', '2026-06-02': '903' });
		Expect(Object.keys(tmpSource.ByDay)).to.deep.equal([ '2026-06-01', '2026-06-02' ], 'insertion order preserved for parallel arrays');
	});

	test('skips rows with missing keys or values; joins verbatim with the given separator', function ()
	{
		let tmpHarness = getHarness();
		let tmpSource = { Rows: [ { K: 'a', V: 'x' }, { K: 'a' }, { V: 'orphan' }, { K: 'b', V: '007' } ] };
		tmpHarness.parser.solve('Joined = AGGREGATIONJOINBYOBJECT(Rows, "K", "V", "|")', tmpSource, {}, tmpHarness.manifest, tmpSource);
		Expect(tmpSource.Joined).to.deep.equal({ a: 'x', b: '007' });
	});

	test('END-TO-END: per-day distinct document counts from CSV provenance columns', function ()
	{
		let tmpHarness = getHarness();
		let tmpSource = { RecordSubset: LAKE_ROWS };
		// Doc 900 appears in BOTH 06-01 rows — naive sums say 4; truth is 3.
		tmpHarness.parser.solve('_csvs = OBJECTVALUESTOARRAY(AGGREGATIONJOINBYOBJECT(RecordSubset, "BucketDate", "IDDocuments", ","))', tmpSource, {}, tmpHarness.manifest, tmpSource);
		tmpHarness.parser.solve('PerDayDocs = MAP VAR v FROM _csvs : COUNTSETELEMENTS(DISTRIBUTIONHISTOGRAM(STRINGGETSEGMENTS(v, ",")))', tmpSource, {}, tmpHarness.manifest, tmpSource);
		Expect(tmpSource.PerDayDocs.map(Number)).to.deep.equal([ 3, 1 ]);
	});
});

suite('DISTRIBUTIONHISTOGRAM on plain value sets', function ()
{
	test('counts element occurrences (uniq -c) instead of erroring', function ()
	{
		let tmpHarness = getHarness();
		let tmpSource = { Vals: [ '900', '901', '900', '902', '900' ] };
		tmpHarness.parser.solve('H = DISTRIBUTIONHISTOGRAM(Vals)', tmpSource, {}, tmpHarness.manifest, tmpSource);
		Expect(tmpSource.H).to.deep.equal({ '900': 3, '901': 1, '902': 1 });
	});

	test('distinct values and distinct count compose from the histogram', function ()
	{
		let tmpHarness = getHarness();
		let tmpSource = { Vals: [ 'a', 'b', 'a' ] };
		tmpHarness.parser.solve('Distinct = OBJECTKEYSTOARRAY(DISTRIBUTIONHISTOGRAM(Vals))', tmpSource, {}, tmpHarness.manifest, tmpSource);
		tmpHarness.parser.solve('DistinctCount = COUNTSETELEMENTS(DISTRIBUTIONHISTOGRAM(Vals))', tmpSource, {}, tmpHarness.manifest, tmpSource);
		Expect(tmpSource.Distinct).to.deep.equal([ 'a', 'b' ]);
		Expect(Number(tmpSource.DistinctCount)).to.equal(2);
	});

	test('the by-object form still works unchanged', function ()
	{
		let tmpHarness = getHarness();
		let tmpSource = { Rows: [ { D: 'a' }, { D: 'a' }, { D: 'b' } ] };
		tmpHarness.parser.solve('H = DISTRIBUTIONHISTOGRAMBYOBJECT(Rows, "D")', tmpSource, {}, tmpHarness.manifest, tmpSource);
		Expect(tmpSource.H).to.deep.equal({ a: 2, b: 1 });
	});
});

suite('DATEFORMAT', function ()
{
	test('formats with dayjs tokens; explicit IANA timezone parameter wins', function ()
	{
		let tmpHarness = getHarness();
		let tmpSource = { When: '2026-06-01T18:30:00Z' };
		tmpHarness.parser.solve('Chicago = DATEFORMAT(When, "YYYY-MM-DD h:mm A", "America/Chicago")', tmpSource, {}, tmpHarness.manifest, tmpSource);
		tmpHarness.parser.solve('Tokyo = DATEFORMAT(When, "YYYY-MM-DD HH:mm", "Asia/Tokyo")', tmpSource, {}, tmpHarness.manifest, tmpSource);
		Expect(tmpSource.Chicago).to.equal('2026-06-01 1:30 PM');
		Expect(tmpSource.Tokyo).to.equal('2026-06-02 03:30', 'crosses the date line');
	});

	test('without the parameter, the configured dayjs default timezone applies (the host-app convention)', function ()
	{
		let tmpHarness = getHarness();
		// The host application (e.g. a pict app) sets the document/project
		// timezone once: this is the existing global DATEFORMAT defers to.
		tmpHarness.fable.Dates.dayJS.tz.setDefault('America/New_York');
		let tmpSource = { When: '2026-06-01T18:30:00Z' };
		tmpHarness.parser.solve('Eastern = DATEFORMAT(When, "YYYY-MM-DD h:mm A")', tmpSource, {}, tmpHarness.manifest, tmpSource);
		Expect(tmpSource.Eastern).to.equal('2026-06-01 2:30 PM');
		tmpHarness.fable.Dates.dayJS.tz.setDefault();
	});

	test('unparseable values return undefined rather than rendering garbage', function ()
	{
		let tmpHarness = getHarness();
		let tmpSource = { When: 'not-a-date' };
		tmpHarness.parser.solve('Out = DATEFORMAT(When, "YYYY-MM-DD")', tmpSource, {}, tmpHarness.manifest, tmpSource);
		Expect(tmpSource.Out).to.equal(undefined);
	});
});

suite('CHARTTICKS', function ()
{
	function getTickHarness()
	{
		let testFable = new libFable();
		return { fable: testFable, parser: testFable.instantiateServiceProviderIfNotExists('ExpressionParser'), manifest: testFable.newManyfest() };
	}

	function dailyDates(pStartISO, pCount)
	{
		const tmpDates = [];
		let tmpCursor = new Date(pStartISO + 'T00:00:00Z').getTime();
		for (let i = 0; i < pCount; i++)
		{
			tmpDates.push(new Date(tmpCursor + i * 86400000).toISOString().slice(0, 10));
		}
		return tmpDates;
	}

	test('8 years of daily dates collapse to year-boundary ticks', function ()
	{
		let tmpHarness = getTickHarness();
		let tmpSource = { Labels: dailyDates('2018-03-15', 2922) };
		tmpHarness.parser.solve('Ticks = CHARTTICKS(Labels, 12)', tmpSource, {}, tmpHarness.manifest, tmpSource);
		Expect(tmpSource.Ticks.length).to.equal(2922, 'same length — alignment preserved');
		const tmpKept = tmpSource.Ticks.filter((pLabel) => pLabel !== '');
		Expect(tmpKept.length).to.be.within(2, 12);
		Expect(tmpKept).to.include('2019');
		Expect(tmpKept).to.include('2025');
	});

	test('90 daily dates collapse to month-grain ticks', function ()
	{
		let tmpHarness = getTickHarness();
		let tmpSource = { Labels: dailyDates('2026-01-01', 90) };
		tmpHarness.parser.solve('Ticks = CHARTTICKS(Labels, 12)', tmpSource, {}, tmpHarness.manifest, tmpSource);
		const tmpKept = tmpSource.Ticks.filter((pLabel) => pLabel !== '');
		Expect(tmpKept).to.deep.equal([ 'Jan 2026', 'Feb 2026', 'Mar 2026' ]);
		Expect(tmpSource.Ticks[0]).to.equal('Jan 2026', 'first boundary lands on the first element');
		Expect(tmpSource.Ticks[1]).to.equal('');
	});

	test('numeric and plain-string sets get a positional stride; short sets pass through', function ()
	{
		let tmpHarness = getTickHarness();
		let tmpSource = { Numbers: Array.from({ length: 50 }, (_, i) => String(i * 10)), Few: [ 'a', 'b', 'c' ] };
		tmpHarness.parser.solve('NumTicks = CHARTTICKS(Numbers, 10)', tmpSource, {}, tmpHarness.manifest, tmpSource);
		tmpHarness.parser.solve('FewTicks = CHARTTICKS(Few, 10)', tmpSource, {}, tmpHarness.manifest, tmpSource);
		const tmpKept = tmpSource.NumTicks.filter((pLabel) => pLabel !== '');
		Expect(tmpKept.length).to.equal(10);
		Expect(tmpSource.NumTicks[0]).to.equal('0');
		Expect(tmpSource.NumTicks[5]).to.equal('50');
		Expect(tmpSource.FewTicks).to.deep.equal([ 'a', 'b', 'c' ], 'under budget: untouched');
	});

	test('the tick budget is honored even when one calendar unit overflows it', function ()
	{
		let tmpHarness = getTickHarness();
		// 40 years of annual data: even YEAR boundaries (40) exceed maxTicks 10.
		let tmpSource = { Labels: Array.from({ length: 40 }, (_, i) => `${1986 + i}-07-01`) };
		tmpHarness.parser.solve('Ticks = CHARTTICKS(Labels, 10)', tmpSource, {}, tmpHarness.manifest, tmpSource);
		const tmpKept = tmpSource.Ticks.filter((pLabel) => pLabel !== '');
		Expect(tmpKept.length).to.be.within(2, 10);
	});
});

suite('SETDENSITY (the generic analyzer behind CHARTTICKS)', function ()
{
	function getDensityHarness()
	{
		let testFable = new libFable();
		return { fable: testFable, parser: testFable.instantiateServiceProviderIfNotExists('ExpressionParser'), manifest: testFable.newManyfest() };
	}

	test('numeric sets get NICE-STEP boundaries (powers-of-ten ladder), not positional ones', function ()
	{
		let tmpHarness = getDensityHarness();
		// Non-uniformly spaced values: positional stride would pick arbitrary
		// values; nice-step boundaries land on round numbers.
		let tmpValues = [];
		for (let i = 0; i < 60; i++) { tmpValues.push(String(Math.floor(Math.pow(i, 1.7)))); } // 0..~1000, uneven
		let tmpSource = { Vals: tmpValues };
		tmpHarness.parser.solve('D = SETDENSITY(Vals, 10)', tmpSource, {}, tmpHarness.manifest, tmpSource);
		Expect(tmpSource.D.SetType).to.equal('number');
		Expect(tmpSource.D.Unit).to.match(/^step:/);
		const tmpLabels = tmpSource.D.Boundaries.map((pBoundary) => Number(pBoundary.Label));
		Expect(tmpSource.D.Boundaries.length).to.be.within(2, 10);
		for (const tmpLabel of tmpLabels)
		{
			Expect(tmpLabel % Number(tmpSource.D.Unit.split(':')[1])).to.equal(0, 'labels are multiples of the nice step');
		}
	});

	test('date sets return unit + indexed boundaries usable by any consumer (HTML group headers etc.)', function ()
	{
		let tmpHarness = getDensityHarness();
		const tmpDates = [];
		for (let i = 0; i < 120; i++) { tmpDates.push(new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)); }
		let tmpSource = { Dates: tmpDates };
		tmpHarness.parser.solve('D = SETDENSITY(Dates, 12)', tmpSource, {}, tmpHarness.manifest, tmpSource);
		Expect(tmpSource.D.SetType).to.equal('date');
		Expect(tmpSource.D.Unit).to.equal('month');
		Expect(tmpSource.D.Boundaries[0]).to.deep.equal({ Index: 0, Value: '2026-01-01', Label: 'Jan 2026' });
		Expect(tmpSource.D.Boundaries[1].Index).to.equal(31, 'boundary at the Feb 1 position');
	});

	test('under-budget and ordinal sets degrade sanely', function ()
	{
		let tmpHarness = getDensityHarness();
		let tmpSource = { Few: [ 'a', 'b' ], Words: Array.from({ length: 30 }, (_, i) => `item-${i}`) };
		tmpHarness.parser.solve('DFew = SETDENSITY(Few, 10)', tmpSource, {}, tmpHarness.manifest, tmpSource);
		tmpHarness.parser.solve('DWords = SETDENSITY(Words, 10)', tmpSource, {}, tmpHarness.manifest, tmpSource);
		Expect(tmpSource.DFew.Boundaries.length).to.equal(2);
		Expect(tmpSource.DWords.SetType).to.equal('ordinal');
		Expect(tmpSource.DWords.Boundaries[1].Index).to.equal(3, 'uniform stride');
	});
});

suite('TRIM family and NUMBERFORMAT', function ()
{
	function getStringHarness()
	{
		let testFable = new libFable();
		return { fable: testFable, parser: testFable.instantiateServiceProviderIfNotExists('ExpressionParser'), manifest: testFable.newManyfest() };
	}

	test('TRIM/RTRIM/LTRIM handle padding, quotes, and missing values', function ()
	{
		let tmpHarness = getStringHarness();
		// The CHAR(48)-padded label case incl. an embedded quote — the
		// segment-split rtrim workaround could never handle these.
		let tmpSource = { Padded: '1/2" RAP                              ', Spaced: '  mid  ' };
		tmpHarness.parser.solve('R = RTRIM(Padded)', tmpSource, {}, tmpHarness.manifest, tmpSource);
		tmpHarness.parser.solve('T = TRIM(Spaced)', tmpSource, {}, tmpHarness.manifest, tmpSource);
		tmpHarness.parser.solve('L = LTRIM(Spaced)', tmpSource, {}, tmpHarness.manifest, tmpSource);
		Expect(tmpSource.R).to.equal('1/2" RAP');
		Expect(tmpSource.T).to.equal('mid');
		Expect(tmpSource.L).to.equal('mid  ');
		tmpHarness.parser.solve('M = TRIM(Absent)', tmpSource, {}, tmpHarness.manifest, tmpSource);
		Expect(tmpSource.M).to.equal('');
	});

	test('RTRIM works inside a MAP body (the per-label use case)', function ()
	{
		let tmpHarness = getStringHarness();
		let tmpSource = { Labels: [ '4LT   ', 'Unknown', 'N50 12.5mm  FDL Airport (P401)   ' ] };
		tmpHarness.parser.solve('Clean = MAP VAR v FROM Labels : RTRIM(v)', tmpSource, {}, tmpHarness.manifest, tmpSource);
		Expect(tmpSource.Clean).to.deep.equal([ '4LT', 'Unknown', 'N50 12.5mm  FDL Airport (P401)' ], 'internal double space preserved');
	});

	test('ADDCOMMAS groups digits VERBATIM — arbitrary precision preserved, no float coercion', function ()
	{
		let tmpHarness = getStringHarness();
		let tmpSource = { Big: '1234567.891', Huge: '123456789012345678901234567890', Tiny: '0.000000000001234' };
		tmpHarness.parser.solve('A = ADDCOMMAS(Big)', tmpSource, {}, tmpHarness.manifest, tmpSource);
		tmpHarness.parser.solve('D = ADDCOMMAS(Absent)', tmpSource, {}, tmpHarness.manifest, tmpSource);
		Expect(tmpSource.A).to.equal('1,234,567.891');
		Expect(tmpSource.D).to.equal('');
		// The FUNCTION is verbatim — arbitrary precision and sub-precision
		// decimals group/pass intact at the service level. (Through the
		// solver, the expression layer's own operand marshaling e-notates
		// values outside float-friendly display range BEFORE any function
		// sees them — a pre-existing parser behavior, pinned here so the
		// boundary is explicit.)
		Expect(tmpHarness.fable.DataFormat.addCommasToValue('123456789012345678901234567890'))
			.to.equal('123,456,789,012,345,678,901,234,567,890');
		Expect(tmpHarness.fable.DataFormat.addCommasToValue('0.000000000001234'))
			.to.equal('0.000000000001234');
	});

	test('STRINGGETSEGMENTS custom enclosure maps work (the undefined-parameter bug) and {} disables enclosures', function ()
	{
		let tmpHarness = getStringHarness();
		// An unbalanced double-quote previously jammed the enclosure stack and
		// disabled splitting entirely; empty maps = plain split.
		let tmpSource = { Quoted: '1/2" RAP,4LT,Unknown' };
		tmpHarness.parser.solve('Plain = STRINGGETSEGMENTS(Quoted, ",", "")', tmpSource, {}, tmpHarness.manifest, tmpSource);
		Expect(tmpSource.Plain).to.deep.equal([ '1/2" RAP', '4LT', 'Unknown' ]);
	});
});
