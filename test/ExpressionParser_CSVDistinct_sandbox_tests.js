/**
 * Sandbox: can the "per-group distinct count over CSV set columns" ask be
 * met with ONLY existing expression functions?
 *
 * The real-world shape (lake day-rows with document-provenance CSVs):
 * summing per-row counts over-counts a document shared across rows; the
 * correct number is the distinct count of the UNION of each group's CSVs.
 */
var libFable = require('../source/Fable.js');
var Chai = require('chai');
var Expect = Chai.expect;

function getHarness()
{
	let testFable = new libFable();
	return { parser: testFable.instantiateServiceProviderIfNotExists('ExpressionParser'), manifest: testFable.newManyfest() };
}

// Two days; doc 900 contributes to BOTH 06-01 rows (the over-count trap).
const LAKE_ROWS =
[
	{ BucketDate: '2026-06-01', Material: '4LT', IDDocuments: '900,901' },
	{ BucketDate: '2026-06-01', Material: '4MT', IDDocuments: '900,902' },
	{ BucketDate: '2026-06-02', Material: '4LT', IDDocuments: '903' }
];

suite('CSV distinct-count with existing solvers only', function ()
{
	test('primitives: STRINGGETSEGMENTS splits; COUNTSETELEMENTS is LENGTH (its doc claims unique-count — wrong)', function ()
	{
		let tmpHarness = getHarness();
		let _Parser = tmpHarness.parser;
		let tmpSource = { CSV: '900,901,900,902' };
		let tmpDest = {};
		_Parser.solve('Segments = STRINGGETSEGMENTS(CSV, ",")', tmpSource, {}, tmpHarness.manifest, tmpDest);
		_Parser.solve('Count = COUNTSETELEMENTS(STRINGGETSEGMENTS(CSV, ","))', tmpSource, {}, tmpHarness.manifest, tmpDest);
		Expect(tmpDest.Segments).to.deep.equal([ '900', '901', '900', '902' ]);
		// countSetElements is array.length — NO dedup primitive exists in the
		// parser today. (Pinning behavior; the distinct gap is closed by the fixed DISTRIBUTIONHISTOGRAM — see ExpressionParser_SetAndDate_tests.js.)
		Expect(Number(tmpDest.Count)).to.equal(4);
	});

	test('whole-period distinct: achievable in three LEGAL lines (MAP on its own line)', function ()
	{
		let tmpHarness = getHarness();
		let _Parser = tmpHarness.parser;
		// MAP cannot be a function argument (the body ':' trips the assignment
		// linter), but chained one-per-line solvers compose fine.
		let tmpSource = { RecordSubset: LAKE_ROWS };
		// A bare property access is an illegal MAP body (sub-3-token rule) —
		// wrap it in CONCAT to make it an expression.
		_Parser.solve('RowCSVs = MAP VAR r FROM RecordSubset : CONCAT(r.IDDocuments, "")', tmpSource, {}, tmpHarness.manifest, tmpSource);
		// NOTE: JOIN's real signature is JOIN(separator, array) — its doc page
		// has the arguments reversed.
		_Parser.solve('AllCSV = JOIN(",", RowCSVs)', tmpSource, {}, tmpHarness.manifest, tmpSource);
		_Parser.solve('ElementCount = COUNTSETELEMENTS(STRINGGETSEGMENTS(AllCSV, ","))', tmpSource, {}, tmpHarness.manifest, tmpSource);
		console.log('       [whole-period] AllCSV =', JSON.stringify(tmpSource.AllCSV), '| ElementCount =', tmpSource.ElementCount);
		// The union CSV is buildable (MAP one-per-line + JOIN(separator, array)
		// — JOIN's doc reverses its real argument order). But only the ELEMENT
		// count is expressible: COUNTSETELEMENTS alone is a length;
		// the distinct count needs DISTRIBUTIONHISTOGRAM composition (see
		// ExpressionParser_SetAndDate_tests.js).
		Expect(Number(tmpSource.ElementCount)).to.equal(5);
	});

	test('per-group via FINDFIRSTVALUEBYEXACTMATCH inside MAP: silently UNDERCOUNTS multi-row groups', function ()
	{
		let tmpHarness = getHarness();
		let _Parser = tmpHarness.parser;
		let tmpSource = { RecordSubset: LAKE_ROWS, Days: [ '2026-06-01', '2026-06-02' ] };
		let tmpResult = _Parser.solve('FirstRows = MAP VAR d FROM Days : FINDFIRSTVALUEBYEXACTMATCH(RecordSubset, "BucketDate", d)', tmpSource, {}, tmpHarness.manifest, tmpSource);
		console.log('       [first-match] FirstRows =', JSON.stringify(tmpSource.FirstRows));
		// External addresses (RecordSubset) do not resolve inside a MAP body's
		// function arguments — this returns nulls. Pinned as a grammar limit;
		// even if it resolved, first-match would silently undercount
		// multi-row groups.
		Expect(tmpSource.FirstRows).to.deep.equal([ undefined, undefined ]);
	});

	test('per-group keys: OBJECTKEYSTOARRAY over the aggregation histogram', function ()
	{
		let tmpHarness = getHarness();
		let _Parser = tmpHarness.parser;
		let tmpSource = { RecordSubset: LAKE_ROWS };
		let tmpDest = {};
		_Parser.solve('Days = OBJECTKEYSTOARRAY(AGGREGATIONHISTOGRAMBYOBJECT(RecordSubset, "BucketDate", "BucketDate"))', tmpSource, {}, tmpHarness.manifest, tmpDest);
		console.log('       [keys] Days =', JSON.stringify(tmpDest.Days));
		Expect(tmpDest.Days).to.deep.equal([ '2026-06-01', '2026-06-02' ]);
	});



	test('per-group union attempt B: two passes — MAP rows to masked strings per day via parallel arrays', function ()
	{
		let tmpHarness = getHarness();
		let _Parser = tmpHarness.parser;
		// Flat alternative if nesting fails: one MAP per day is impossible to
		// author generically, but a keyed merge CAN be faked by MAPping rows
		// to "key|csv" pair strings — see what survives the parser.
		let tmpSource = { RecordSubset: LAKE_ROWS };
		let tmpDest = {};
		let tmpResult = _Parser.solve('Pairs = MAP VAR r FROM RecordSubset : CONCAT(r.BucketDate, "|", r.IDDocuments)', tmpSource, {}, tmpHarness.manifest, tmpDest);
		console.log('       [pairs] Pairs =', JSON.stringify(tmpDest.Pairs));
	});

	test('CLEANVALUEARRAY strips empties but is NUMERIC-coercing (parsePrecise filter), not a string-set tool', function ()
	{
		let tmpHarness = getHarness();
		let _Parser = tmpHarness.parser;
		let tmpSource = { Polluted: ',900,901,,900' };
		let tmpDest = {};
		_Parser.solve('Raw = COUNTSETELEMENTS(STRINGGETSEGMENTS(Polluted, ","))', tmpSource, {}, tmpHarness.manifest, tmpDest);
		_Parser.solve('Cleaned = COUNTSETELEMENTS(CLEANVALUEARRAY(STRINGGETSEGMENTS(Polluted, ",")))', tmpSource, {}, tmpHarness.manifest, tmpDest);
		console.log('       [pollution] Raw =', tmpDest.Raw, '| Cleaned =', tmpDest.Cleaned);
		Expect(Number(tmpDest.Raw)).to.equal(5, 'raw element count, empties included');
		Expect(Number(tmpDest.Cleaned)).to.equal(3, 'empties dropped; duplicates STILL counted (no dedup)');
	});
});
