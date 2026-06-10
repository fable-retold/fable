/**
* Unit tests for Fable Math
*
* @license     MIT
*
* @author      Steven Velozo <steven@velozo.com>
*/

var libFable = require('../source/Fable.js');

var Chai = require("chai");
var Expect = Chai.expect;

function getExpressionParser()
{
	let testFable = new libFable();
	return testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
}

suite
	(
		'Expressions',
		function ()
		{
			suite
				(
					'Math Expressions',
					function ()
					{
						test
							(
								'Exercise the Tokenizer',
								(fDone) =>
								{
									let tmpResultObject = {};
									let _Parser = getExpressionParser();
									let tokenizedResults = _Parser.tokenize('5 + 2', tmpResultObject);
									Expect(tokenizedResults.length).to.equal(3);
									Expect(tokenizedResults).to.deep.equal(['5', '+', '2']);
									Expect(tmpResultObject.RawExpression).to.equal('5 + 2');
									Expect(tmpResultObject.RawTokens).to.deep.equal(tokenizedResults);
									let complexTokenizedResults = _Parser.tokenize('5+3 - sqrt(75 / (3 + {Depth}) * Width)^ 3');
									Expect(complexTokenizedResults.length).to.equal(18);
									Expect(complexTokenizedResults).to.deep.equal(['5', '+', '3', '-', 'sqrt', '(', '75', '/', '(', '3', '+', '{Depth}', ')', '*', 'Width', ')', '^', '3']);
									let complexTokenizedResultsDoubleWidthOperators = _Parser.tokenize('SpecialValue ?= 5+3 - sqrt(75 / (3 + {Depth}) * Width)^ 3');
									Expect(complexTokenizedResultsDoubleWidthOperators.length).to.equal(20);
									Expect(complexTokenizedResultsDoubleWidthOperators).to.deep.equal(['SpecialValue', '?=', '5', '+', '3', '-', 'sqrt', '(', '75', '/', '(', '3', '+', '{Depth}', ')', '*', 'Width', ')', '^', '3']);

									let tokenizedWithSymbologyInQuotes = _Parser.tokenize('5 + 2 * "Hello World"');
									Expect(tokenizedWithSymbologyInQuotes.length).to.equal(5);
									Expect(tokenizedWithSymbologyInQuotes).to.deep.equal(['5', '+', '2', '*', '"Hello World"']);
									// TODO: refresh on the tokenization process and see if this is a valid test
									//Expect(tmpResultObject.RawExpression).to.equal('5 + 2');
									let tokenizedNegativeParams = _Parser.tokenize('SUM(10, -10)');
									//Expect(tokenizedNegativeParams.length).to.equal(6);
									Expect(tokenizedNegativeParams).to.deep.equal(['SUM', '(', '10', ',', '-', '10', ')']);
									let unbalancedParens = _Parser.tokenize('ROUND(5 + (2 * 10), 10))');
									Expect(unbalancedParens).to.deep.equal(['ROUND', '(', '5', '+', '(', '2', '*', '10', ')', ',', '10', ')', ')']);
									return fDone();
								}
							);
						test
							(
								'Exercise the Linter',
								(fDone) =>
								{
									let tmpResultObject = {};
									let _Parser = getExpressionParser();

									let tokenizedResults = _Parser.tokenize('5 + 2', tmpResultObject);
									let lintedResults = _Parser.lintTokenizedExpression(tokenizedResults, tmpResultObject);
									Expect(lintedResults.length).to.equal(1);
									Expect(lintedResults[0]).to.contain('lintTokenizedExpression found no equality assignment in the tokenized')

									let complexTokenizedResults = _Parser.tokenize('Value = 5+3 - sqrt(75 / (3 + -{Depth}) * Width)^ 3');
									let complexLintedResults = _Parser.lintTokenizedExpression(complexTokenizedResults, tmpResultObject);
									Expect(complexLintedResults.length).to.equal(0);

									let brokenTokenizedResults = _Parser.tokenize('Value = 5+3 - sqrt(75 */ (3 + {Depth}) * Width)^ 3');
									let brokenLintedResults = _Parser.lintTokenizedExpression(brokenTokenizedResults, tmpResultObject);
									// The */ is invalid!!!!
									Expect(brokenLintedResults.length).to.equal(1);

									let unbalancedParensTokenizedResults = _Parser.tokenize('Value = ROUND(5 + (2 * 10), 10))');
									let unbalancedParensLintedResults = _Parser.lintTokenizedExpression(unbalancedParensTokenizedResults, tmpResultObject);
									// The unbalanced parens should be caught
									Expect(unbalancedParensLintedResults.length).to.equal(1);
									Expect(unbalancedParensLintedResults[0]).to.contain('unbalanced parenthesis');
									return fDone();
								}
							);
						test
							(
								'Exercise Postfix Notation Conversion',
								(fDone) =>
								{
									let tmpResultObject = {};

									let _Parser = getExpressionParser();

									let tokenizedResults = _Parser.tokenize('= 5 + 2', tmpResultObject);
									let lintedResults = _Parser.lintTokenizedExpression(tokenizedResults, tmpResultObject);
									let postfixResults = _Parser.buildPostfixedSolveList(tokenizedResults, tmpResultObject);
									Expect(postfixResults.length).to.equal(2);

									let negativeConstantResults = _Parser.tokenize('Value = (-5 + 3)');
									let negativeConstantValueLintedResults = _Parser.lintTokenizedExpression(negativeConstantResults);
									let negativeConstantValueResults = _Parser.buildPostfixedSolveList(negativeConstantResults);
									Expect(negativeConstantValueResults.length).to.equal(3);

									let complexTokenizedResults = _Parser.tokenize('Value = 5+3 - sqrt(75 / (3 + -{Depth}) * Width)^ 3');
									let complexLintedResults = _Parser.lintTokenizedExpression(complexTokenizedResults);
									let complexPostfixResults = _Parser.buildPostfixedSolveList(complexTokenizedResults);
									Expect(complexPostfixResults.length).to.equal(9);

									return fDone();
								}
							);
						test
							(
								'Exercise Variable Lookup and Substitution',
								(fDone) =>
								{
									let _Parser = getExpressionParser();

									let tmpResultObject = {};
									let tmpDataObject = { X: 5, Y: 3, Z: 75, Depth: 3, Width: 2 };
									let tmpDestinationObject = {};

									let tmpArea = _Parser.solve('Area = X * Y  * Z', tmpDataObject, tmpResultObject, false, tmpDestinationObject);

									Expect(tmpArea).to.equal("1125");
									Expect(tmpDestinationObject.Area).to.equal("1125");


									let tmpVariableAssignment = _Parser.solve('NewX = X', tmpDataObject, tmpResultObject, false, tmpDestinationObject);
									let tmpConstantAssignment = _Parser.solve('NewConst = 8.675309', tmpDataObject, tmpResultObject, false, tmpDestinationObject);
									let tmpStringAssignment = _Parser.solve('NewString = "Hello World!"', tmpDataObject, tmpResultObject, false, tmpDestinationObject);

									Expect(tmpDestinationObject.NewX).to.equal("5");
									Expect(tmpDestinationObject.NewConst).to.equal("8.675309");
									Expect(tmpDestinationObject.NewString).to.equal("Hello World!");

									return fDone();
								}
							);
						test
							(
								'Capture array -> number bug',
								(fDone) =>
								{
									let _Parser = getExpressionParser();

									let tmpResultObject = {};
									let tmpDataObject = { W: ['3', '4', '5'], X: ['5'], Y: 3, Z: 75, Depth: 3, Width: 2 };
									let tmpDestinationObject = {};

									let tmpArea = _Parser.solve('Area = X * Y * Z', tmpDataObject, tmpResultObject, false, tmpDestinationObject);

									Expect(tmpArea).to.equal("1125");

									let tmpSliced = _Parser.solve('SlicedSingleElementArray = SLICE(X, 0, 1)', tmpDataObject, tmpResultObject, false, tmpDestinationObject);

									Expect(tmpSliced).to.be.an('array');
									Expect(tmpSliced.length).to.equal(1);
									Expect(tmpSliced[0]).to.equal('5');

									let tmpNonNumberTreatedAsZero = _Parser.solve('NonNumberTreatedAsZero = W + 3.456', tmpDataObject, tmpResultObject, false, tmpDestinationObject);

									Expect(tmpNonNumberTreatedAsZero).to.equal('3.456');

									let tmpLargerSlice = _Parser.solve('SLICE(W, 1, 3)', tmpDataObject, tmpResultObject, false, tmpDestinationObject);

									Expect(tmpLargerSlice).to.be.an('array');
									Expect(tmpLargerSlice.length).to.equal(2);
									Expect(tmpLargerSlice[0]).to.equal('4');
									Expect(tmpLargerSlice[1]).to.equal('5');

									return fDone();
								}
							);
						test
							(
								'Exercise Marshaling to Value at a Hashed Address',
								(fDone) =>
								{

									let testFable = new libFable();
									testFable.AppData = { Pit: "Bottomless" };
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');

									let tmpDataObject = { X: 5.867, Y: 3.1, Z: 75, Depth: 3, Width: 2 };
									let tmpResultObject = {};
									let tmpDestinationObject = {};

									_Parser.solve('Area = X * Y  * Z', tmpDataObject, tmpResultObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.Area).to.equal("1364.0775");

									_Parser.solve('PitSize = getvalue("AppData.Pit")', tmpDataObject, tmpResultObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.PitSize).to.equal("Bottomless");

									_Parser.solve('Value = -3', tmpDataObject, tmpResultObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.Value).to.equal("-3");

									_Parser.solve('Value2 = (4 + -3)', tmpDataObject, tmpResultObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.Value2).to.equal("1");

									_Parser.solve('ValueN = 5+3 - sqrt(75 / (3 + -1) * 2)^ 3', tmpDataObject, tmpResultObject, false, tmpDestinationObject);
									Expect(testFable.Math.ltPrecise(
										testFable.Math.absPrecise(
											testFable.Math.subtractPrecise(tmpDestinationObject.ValueN, "-641.5190528383289850727923780647")),
										'0.00000000000000001'))
										.to.equal(true, 'Expected complex expression to be with a small epsilon of the computed value');

									tmpDataObject.Temp = '24';
									tmpDataObject.HR = '20.5';
									_Parser.solve('2.71828182845905 ^ -0.282444', tmpDataObject, tmpResultObject, false, tmpDestinationObject);
									testFable.ExpressionParser.Messaging.logFunctionSolve(tmpResultObject);
									_Parser.solve('EGS=ROUND(ROUND(0.0172834*2.71828182845905^(-0.0117685*Temp),5)*SQRT(ROUND(16.294-0.163*HR,1)/60),4)',
										tmpDataObject, tmpResultObject, false, tmpDestinationObject);
									_Parser.solve('EGSR=ROUND(ROUND(0.0172834*2.71828182845905^(((1-2)*0.0117685)*Temp),5)*SQRT(ROUND(16.294-0.163*HR,1)/60),4)',
										tmpDataObject, tmpResultObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.EGS).to.equal(tmpDestinationObject.EGSR);
									testFable.ExpressionParser.Messaging.logFunctionSolve(tmpResultObject);
									Expect(tmpDestinationObject.EGS).to.equal("0.0061");
									_Parser.solve('MATH_DP=ROUND(1.2345, 5 - 2)',
										tmpDataObject, tmpResultObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.MATH_DP).to.equal("1.235");

									tmpDataObject.EJBinderGb1 = '15.5';
									tmpDataObject.EKPctBinderPb2 = '2.55555';
									_Parser.solve('EGse1 = Round((100 - EJBinderGb1) / EKPctBinderPb2), 2)', tmpDataObject, tmpResultObject, false, tmpDestinationObject);
									//TODO: we can consider solving and ignoring this paren, but for now, the error is fatal
									Expect(tmpDestinationObject.EGse1).to.not.exist;
									testFable.ExpressionParser.Messaging.logFunctionSolve(tmpResultObject);

									_Parser.solve('EGse1 = Round((100 - EJBinderGb1) / EKPctBinderPb2, 2)', tmpDataObject, tmpResultObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.EGse1).to.equal('33.07');

									_Parser.solve('EGse1 = Round((100 - EJBinderGb1) / EKPctBinderPb2), 2)', tmpDataObject, tmpResultObject, false, tmpDestinationObject);
									// ensure that this does mutate the output on error
									Expect(tmpDestinationObject.EGse1).to.not.exist;

									return fDone();
								}
							);
						test
							(
								'Test iterative series',
								(fDone) =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');

									let tmpResult = _Parser.solve('Result = ITERATIVESERIES(Values, "Value", "Resultant", 1, "add")',
										{
											Values: [
												{ Value: 10 },
												{ Value: 20 },
												{ Value: 5 }
											]
										});

									Expect(tmpResult[0].Resultant).to.equal("10");
									Expect(tmpResult[1].Resultant).to.equal("30");
									Expect(tmpResult[2].Resultant).to.equal("35");

									return fDone();
								}
							)
						test
							(
								'Exercise End-to-End Expression Parsing',
								(fDone) =>
								{
									let _Parser = getExpressionParser();

									Expect(_Parser.solve('1 + 1')).to.equal("2");
									Expect(_Parser.solve('1 * 1')).to.equal("1");
									Expect(_Parser.solve('1 / 1')).to.equal("1");
									Expect(_Parser.solve('1 - 1')).to.equal("0");
									Expect(_Parser.solve('10 * 2')).to.equal("20");

									Expect(_Parser.solve('200 * 1.5')).to.equal("300");
									Expect(_Parser.solve('7 +13')).to.equal("20");
									Expect(_Parser.solve('7+14')).to.equal("21");

									Expect(_Parser.solve('Result = datemilliseconddifference("2023-08-10T05:00:00.000Z", "2023-08-11T05:00:00.000Z")')).to.equal("86400000");
									Expect(_Parser.solve('Result = datemilliseconddifference(StartDate, EndDate)', { StartDate: "2023-08-10T05:00:00.000Z", EndDate: "2023-08-11T05:00:00.000Z" })).to.equal("86400000");
									Expect(_Parser.solve('Result = datemilliseconddifference(StartDate, EndDate)', { StartDate: "2023-08-10T05:11:00.000Z", EndDate: "2023-08-11T05:00:00.000Z" })).to.equal("85740000");
									Expect(_Parser.solve('Result = datemilliseconddifference(StartDate, EndDate, 1)', { StartDate: "2023-08-10T05:11:00.000Z" })).to.equal('NaN');
									Expect(_Parser.solve('Result = dateseconddifference(StartDate, EndDate)', { StartDate: "2023-08-10T05:00:00.000Z", EndDate: "2023-08-11T05:00:00.000Z" })).to.equal("86400");
									Expect(_Parser.solve('Result = datehourdifference(StartDate, EndDate)', { StartDate: "2023-08-10T05:00:00.000Z", EndDate: "2023-08-11T05:00:00.000Z" })).to.equal("24");
									Expect(_Parser.solve('Result = dateminutedifference(StartDate, EndDate)', { StartDate: "2023-08-10T05:00:00.000Z", EndDate: "2023-08-11T05:00:00.000Z" })).to.equal("1440");
									Expect(_Parser.solve('Result = datehourdifference(StartDate, EndDate)', { StartDate: "2023-08-10T05:00:00.000Z", EndDate: "2023-08-11T05:00:00.000Z" })).to.equal("24");
									Expect(_Parser.solve('Result = datedaydifference(StartDate, EndDate)', { StartDate: "2023-08-10T05:00:00.000Z", EndDate: "2023-08-11T05:00:00.000Z" })).to.equal("1");
									Expect(_Parser.solve('Result = dateweekdifference(StartDate, EndDate)', { StartDate: "2023-08-10T05:00:00.000Z", EndDate: "2023-05-22T05:00:00.000Z" })).to.equal("-11");
									Expect(_Parser.solve('Result = datemonthdifference(StartDate, EndDate)', { StartDate: "2023-08-10T05:00:00.000Z", EndDate: "2021-01-11T05:00:00.000Z" })).to.equal("-30");
									Expect(_Parser.solve('Result = dateyeardifference(StartDate, EndDate)', { StartDate: "1986-08-10T05:00:00.000Z", EndDate: "2023-08-11T05:00:00.000Z" })).to.equal("37");

									Expect(_Parser.solve('5 + 2 * 10')).to.equal("25");
									Expect(_Parser.solve('3.5 + 5 + 10 * 10 / 5')).to.equal("28.5");

									Expect(_Parser.solve('3.5 + 5 + 10 * 10 / 5 - 1.5')).to.equal("27");

									Expect(_Parser.solve('(100 - 10)')).to.equal("90");

									Expect(_Parser.solve('100.55 - 1.55')).to.equal("99");

									Expect(_Parser.solve('5 + 2')).to.equal('7');

									Expect(_Parser.solve('50.22 + 2')).to.equal('52.22');

									Expect(_Parser.solve('5 ^ 2')).to.equal('25');

									Expect(_Parser.solve('Result = sqrt(100 * (C + 30)) + sin(Depth - Width) / 10', { "PR": 1.5, "Z": "20.036237", "C": -13, Depth: 100.203, Width: 10.5 })).to.equal('41.32965489638783839821');

									Expect(_Parser.solve('((15000 * 2) / 4)^2 + 100 - 10 * (35 + 5)')).to.equal("56249700");

									Expect(_Parser.solve('1.5 * sqrt(8 * 2.423782342^2) / 10')).to.equal('1.02832375808904701855')
									Expect(_Parser.solve('1 * sqrt(16)')).to.equal('4');

									Expect(_Parser.solve('sin(rad(60))')).to.equal('0.8660254037844386');

									Expect(_Parser.solve('Result = 5+3 - sqrt(75 / (3 + Depth) * Width)^ 3', { "PR": 1.5, "Z": "20.036237", "C": -13, Depth: 100.203, Width: 10.5 }))
										.to.equal('-13.078386362213538715906797395732300153182132216343566001917247')

									let tmpResult = _Parser.solve('Result = (160 * PR * Z) / (C / 100) * PR * Z + (160 * (1 - C / 100))', { C: -13, PR: 1.5, Z: 20.03 })
									Expect(tmpResult).to.equal("-1110837.0769230769230769230307");

									let tmpResultPrecise = _Parser.solve('Result = (160 * PR * Z) / (C / 100) * PR * Z + (160 * (1 - C / 100))', { C: "-13", PR: "1.5", Z: "20.03" })
									Expect(tmpResultPrecise).to.equal("-1110837.0769230769230769230307");

									Expect(_Parser.solve('Result = generateguid()').length).to.equal(36);

									return fDone();
								}
							);
						test
							(
								'Exercise End-to-End Expression Parsing with Sets',
								(fDone) =>
								{
									let _Parser = getExpressionParser();

									Expect(_Parser.solve('1 + 1')).to.equal("2");
									Expect(_Parser.solve("Volume = Width * Height * Depth", { "Width": 73.5, "Height": 28.8, "Depth": 200.5 })).to.equal("424418.4");
									Expect(_Parser.solve("TotalCost = SUM(ItemCosts)", { "ItemCosts": [100, 200, 50, 45, 5] })).to.equal("400");
									Expect(_Parser.solve("TotalCost = MEAN(ItemCosts)", { "ItemCosts": [100, 200, 50, 45, 5] })).to.equal("80");
									Expect(_Parser.solve("TotalCost = MEDIAN(ItemCosts)", { "ItemCosts": [100, 200, 50, 45, 5] })).to.equal("50");
									Expect(_Parser.solve("TotalCost = COUNT(ItemCosts)", { "ItemCosts": [100, 200, 50, 45, 5] })).to.equal("5");
									Expect(Number(_Parser.solve("StDev = STDEV(Values)", { "Values": [1,2,3,4,5,6,7,8,9,10,11] }))).to.be.closeTo(3.3166, 0.0001);
									Expect(Number(_Parser.solve("StDevP = STDEVP(Values)", { "Values": [1,2,3,4,5,6,7,8,9,10,11] }))).to.be.closeTo(3.1623, 0.0001);

									_Parser.fable.AppData = {
										Teams: [
											{ Team: 'Mariners', States: 'Washington', Score: 100 },
											{ Team: 'Yankees', States: 'New York', Score: 200 },
											{ Team: 'Mets', States: 'New York', Score: 50 },
											{ Team: 'Giants', States: 'California', Score: 45 },
											{ Team: 'Dodgers', States: 'California', Score: 5 },
											{ Team: 'Astros', States: 'Texas', Score: 75 }
										]
									};

									let tmpHistogramByReference = _Parser.solve(`aggregationhistogram("AppData.Teams", "States", "Score")`);
									Expect(tmpHistogramByReference['New York']).to.equal("250");

									let tmpHistogram = _Parser.solve(`aggregationhistogrambyobject(getvalue("AppData.Teams"), "States", "Score")`);
									Expect(tmpHistogram['New York']).to.equal("250");

									Expect(_Parser.solve("DateFromPartsExample = DATEFROMPARTS(2025, 4, 1)")).to.equal("2025-04-01T00:00:00.000Z");
									Expect(_Parser.solve("DateFromPartsExample = DATEADDDAYS(DATEFROMPARTS(2025, 4, 1, 13, 03, 51, 761),87)")).to.equal("2025-06-27T13:03:51.761Z");

									return fDone();
								}
							);
						test
							(
								'Exercise Value Marshaling',
								(fDone) =>
								{
									let _Parser = getExpressionParser();

									Expect(_Parser.solve('1 + 1')).to.equal("2");
									Expect(_Parser.solve("Volume = Width * Height * Depth", { "Width": 73.5, "Height": 28.8, "Depth": 200.5 })).to.equal("424418.4");
									Expect(_Parser.solve("TotalCost = SUM(ItemCosts)", { "ItemCosts": [100, 200, 50, 45, 5] })).to.equal("400");
									Expect(_Parser.solve("TotalCost = MEAN(ItemCosts)", { "ItemCosts": [100, 200, 50, 45, 5] })).to.equal("80");
									Expect(_Parser.solve("TotalCost = MEDIAN(ItemCosts)", { "ItemCosts": [100, 200, 50, 45, 5] })).to.equal("50");
									Expect(_Parser.solve("TotalCost = COUNT(ItemCosts)", { "ItemCosts": [100, 200, 50, 45, 5] })).to.equal("5");
									Expect(_Parser.solve('NameList = STRINGGETSEGMENTS(Names, ",")}', { "Names": "Jane,John" })).to.deep.equal(["Jane", "John"]);
									Expect(_Parser.solve('NameList = STRINGGETSEGMENTS(Names, ",")}', { "Names": "Jane,John" })).to.deep.equal(["Jane", "John"]);

									return fDone();
								}
							);
						test
							(
								'Exercise Rounding',
								(fDone) =>
								{
									let _Parser = getExpressionParser();

									let tmpSolveResults = {};
									let tmpDataObject = { X: 5.867, Y: 3.1, Z: 75, Depth: 3, Width: 2 };
									// 1364.0775
									let tmpResult = _Parser.solve('Area = ROUND(X * Y  * Z)', tmpDataObject, tmpSolveResults);
									Expect(tmpResult).to.equal("1364");
									tmpResult = _Parser.solve('Area = ROUND(X * Y  * Z, 2)', tmpDataObject, tmpSolveResults);
									Expect(tmpResult).to.equal("1364.08");
									return fDone();
								}
							);
						test
							(
								'Exercise Multi-parameter Functions',
								(fDone) =>
								{
									let _Parser = getExpressionParser();

									let tmpSolveResults = {};
									let tmpDataObject = { X: 5.867, Y: 3.5, Z: 75.248923423, Depth: 3, Width: 2 };
									// 1364.0775
									let tmpResult = _Parser.solve('Area = ROUND(X * Y  * Z)', tmpDataObject, tmpSolveResults);
									Expect(tmpResult).to.equal("1545");
									tmpResult = _Parser.solve('Area = ROUND(X * Y  * Z, 3, 3)', tmpDataObject, tmpSolveResults);
									Expect(tmpResult).to.equal("1545.2");
									// Test the getvaluarray function]
									// TODO: Fix the return values for these expression return functions
									//tmpResult = _Parser.solve('NewSet = GETVALUEARRAY(X, Y, Z)', tmpDataObject, tmpSolveResults);
									//tmpResult = _Parser.solve('NewSetAverage = SUM(NewSet)', tmpDataObject, tmpSolveResults);
									//Expect(tmpResult).to.equal("84.115923423");
									return fDone();
								}
							);
						test
							(
								'Exercise Complex Assignments',
								(fDone) =>
								{
									let testFable = new libFable();

									testFable.AppData = { Students: ["Kim", "Jim", "Joan Jett", "Tank Girl"] };

									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');

									let tmpResultObject = {};

									let tmpSolveResults = {};
									let tmpDataObject = { X: 5.867, Y: 3.5, Z: 75.248923423, Depth: 3, Width: 2, Name: "Jerry" };

									_Parser.solve('Area = ROUND(X * Y  * Z, 3, 3)', tmpDataObject, tmpSolveResults, false, tmpResultObject);

									// Because the results object doesn't have a name in it, the null coalescence assignment operator should just work
									let tmpResult = _Parser.solve('Name ?= GETVALUE("AppData.Students[0]")', tmpDataObject, tmpSolveResults, false, tmpResultObject);
									Expect(tmpResultObject.Name).to.equal("Kim");

									tmpResult = _Parser.solve('Area = ROUND(X * Y  * Z, 3, 3)', tmpDataObject, tmpSolveResults, false, tmpResultObject);
									Expect(tmpResult).to.equal("1545.2");

									// Now that name is set, it shouldn't change.
									tmpResult = _Parser.solve('Name ?= GETVALUE("AppData.Students[1]")', tmpDataObject, tmpSolveResults, false, tmpResultObject);
									Expect(tmpResultObject.Name).to.equal("Kim");

									// Regular assignment should change it.
									tmpResult = _Parser.solve('Name = GETVALUE("AppData.Students[1]")', tmpDataObject, tmpSolveResults, false, tmpResultObject);
									Expect(tmpResultObject.Name).to.equal("Jim");

									// Regular assignment should change it.
									tmpResult = _Parser.solve('Name = GETVALUE("AppData.Students[3]")', tmpDataObject, tmpSolveResults, false, tmpResultObject);
									Expect(tmpResultObject.Name).to.equal("Tank Girl");

									// Regular assignment should change it (with an array out of bounds problem...)
									tmpResult = _Parser.solve('Name = GETVALUE("AppData.Students[4]")', tmpDataObject, tmpSolveResults, false, tmpResultObject);
									Expect(tmpResultObject.Name).to.equal(undefined);

									tmpResult = _Parser.solve('SETVALUE("AppData.Students[3]", "Dan")', tmpDataObject, tmpSolveResults, false, tmpResultObject);
									tmpResult = _Parser.solve('Name = GETVALUE("AppData.Students[3]")', tmpDataObject, tmpSolveResults, false, tmpResultObject);
									Expect(tmpResultObject.Name).to.equal('Dan');

									return fDone();
								}
							);
						test
							(
								'Exercise Data Generation',
								(fDone) =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');

									let tmpDataObject = {};
									let tmpSolveResults = {};
									let tmpResultObject = {};

									let tmpResult;
									tmpResult = _Parser.solve('RandomIntValue = RANDOMINTEGER()', tmpDataObject, tmpSolveResults, false, tmpResultObject);
									Expect(tmpResult).to.not.be.NaN;

									tmpResult = _Parser.solve('RandomIntValueBetween = RANDOMINTEGERBETWEEN(10, 13)', tmpDataObject, tmpSolveResults, false, tmpResultObject);
									Expect(parseInt(tmpResult)).to.be.at.least(10);
									Expect(parseInt(tmpResult)).to.be.at.most(13);

									tmpResult = _Parser.solve('RandomFloatValue = randomFloat()', tmpDataObject, tmpSolveResults, false, tmpResultObject);
									Expect(tmpResult).to.not.be.NaN;

									tmpResult = _Parser.solve('RandomFloatValueBetween = randomFloatBetween(10.5, 13.78)', tmpDataObject, tmpSolveResults, false, tmpResultObject);
									Expect(parseFloat(tmpResult)).to.be.at.least(10.5);
									Expect(parseFloat(tmpResult)).to.be.at.most(13.78);


									return fDone();
								}
							);
						test
							(
								'Test map operation',
								(fDone) =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');


									let tmpManifest = testFable.newManyfest();
									let tmpDataSourceObject = {};
									tmpDataSourceObject.CitiesData = require('./data/cities.json');
									/* Records look like:
[
	{
		"city": "New York", 
		"growth_from_2000_to_2013": "4.8%", 
		"latitude": 40.7127837, 
		"longitude": -74.0059413, 
		"population": "8405837", 
		"rank": "1", 
		"state": "New York"
	}, 
	{
		"city": "Los Angeles", 
		"growth_from_2000_to_2013": "4.8%", 
		"latitude": 34.0522342, 
		"longitude": -118.2436849, 
		"population": "3884307", 
		"rank": "2", 
		"state": "California"
	}, 
									*/

									tmpDataSourceObject.MapTest = {};
									tmpDataSourceObject.MapTest.Values = [ 1, 2, 3, 4, 5 ];

									let tmpDataDestinationObject = {};
									let tmpParserResultsObject = {};

									let tmpResult = _Parser.solve('SimpleMapResult = MAP VAR x FROM MapTest.Values : x + 100', tmpDataSourceObject, tmpParserResultsObject, tmpManifest, tmpDataDestinationObject);

									// Should expect 101 -> 105
									Expect(tmpDataDestinationObject.SimpleMapResult.length).to.equal(5);
									Expect(tmpDataDestinationObject.SimpleMapResult[0]).to.equal("101");
									Expect(tmpDataDestinationObject.SimpleMapResult[1]).to.equal("102");
									Expect(tmpDataDestinationObject.SimpleMapResult[2]).to.equal("103");
									Expect(tmpDataDestinationObject.SimpleMapResult[3]).to.equal("104");
									Expect(tmpDataDestinationObject.SimpleMapResult[4]).to.equal("105");

									let tmpComplexMapResult = _Parser.solve('ComplexMapResult = MAP VAR cityRecord FROM CitiesData VAR x FROM MapTest.Values : cityRecord.population + (x * 1000000000000000)', tmpDataSourceObject, tmpParserResultsObject, tmpManifest, tmpDataDestinationObject);

									Expect(tmpDataDestinationObject.ComplexMapResult.length).to.equal(1000);
									Expect(tmpDataDestinationObject.ComplexMapResult[0]).to.equal("1000000008405837");
									Expect(tmpDataDestinationObject.ComplexMapResult[4]).to.equal("5000000001553165");
									// We ran out of values 1-5 so now it's just population
									Expect(tmpDataDestinationObject.ComplexMapResult[10]).to.equal("885400");
									Expect(tmpDataDestinationObject.ComplexMapResult[400]).to.equal("81050");

									return fDone();
								}
							);
						test
							(
								'Test integration prepartion..',
								(fDone) =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');

									let tmpManifest = testFable.newManyfest();
									let tmpDataSourceObject = {};
									let tmpDataDestinationObject = {};
									let tmpParserResultsObject = {};

									/* FIXME: This test is broken since `n` doesn't result in a valid postfix expression for the series generation.
									let tmpPassthroughResult = _Parser.solve('IntegrationApproximationResult = SERIES FROM 13.2 TO 25 STEP 0.2 : n', tmpDataSourceObject, tmpParserResultsObject, tmpManifest, tmpDataDestinationObject);
									Expect(tmpDataDestinationObject.IntegrationApproximationResult[0]).to.equal("13.2");
									Expect(tmpDataDestinationObject.IntegrationApproximationResult[1]).to.equal("13.4");
									Expect(tmpDataDestinationObject.IntegrationApproximationResult[59]).to.equal("25");
									 */

									// Approximate an integration of the function 1000 + (n / 2) from 13.2 and 25 every 0.2 values
									let tmpResult = _Parser.solve('IntegrationApproximationResult = SERIES FROM 13.2 TO 25 STEP 0.2 :  1000 + (n / 2)', tmpDataSourceObject, tmpParserResultsObject, tmpManifest, tmpDataDestinationObject);
									Expect(tmpDataDestinationObject.IntegrationApproximationResult[0]).to.equal("1006.6");
									Expect(tmpDataDestinationObject.IntegrationApproximationResult[1]).to.equal("1006.7");
									Expect(tmpDataDestinationObject.IntegrationApproximationResult[59]).to.equal("1012.5");

									let tmpResultWithStep = _Parser.solve('IntegrationApproximationResultWithStep = SERIES FROM 13.2 TO 25 STEP 0.5 : (1000 * stepIndex) + n', tmpDataSourceObject, tmpParserResultsObject, tmpManifest, tmpDataDestinationObject);
									Expect(tmpDataDestinationObject.IntegrationApproximationResultWithStep[0]).to.equal("13.2");
									Expect(tmpDataDestinationObject.IntegrationApproximationResultWithStep[1]).to.equal("1013.7");
									Expect(tmpDataDestinationObject.IntegrationApproximationResultWithStep[23]).to.equal("23024.7");

									testFable.AppData =
									{
										StartValue: 5,
										EndValue: 10,
										StepValue: 0.5,
										BaseValue: 200,
									};
									let tmpResultWithVariables = _Parser.solve('XValues = SERIES FROM StartValue TO EndValue STEP StepValue : (BaseValue * stepIndex) + n',
										testFable.AppData, tmpParserResultsObject, tmpManifest, testFable.AppData);
									Expect(testFable.AppData.XValues.length).to.equal(11);
									Expect(testFable.AppData.XValues[0]).to.equal('5');
									Expect(testFable.AppData.XValues[5]).to.equal('1007.5');
									Expect(testFable.AppData.XValues[10]).to.equal('2010');

									return fDone();
								}
							);
						test
							(
								'Test monte carlo...',
								(fDone) =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
									let tmpManifest = testFable.newManyfest();

									let tmpDataSourceObject = {};
									let tmpDataDestinationObject = {};
									let tmpParserResultsObject = {};

									// Approximate an integration of the function 1000 + (n / 2) from 13.2 and 25 every 0.2 values
									let tmpResult = _Parser.solve('MonteCarloResult = MONTECARLO SAMPLECOUNT 1000 VAR x PT x 50 PT x 100 : 10000000 + x', tmpDataSourceObject, tmpParserResultsObject, tmpManifest, tmpDataDestinationObject);

									// Generate 1000 samples between 50 and 100, added to 10 million
									Expect(tmpResult).to.exist;
									Expect(tmpResult.Samples.length).to.equal(1000);

									// Rosenbrock function test (experimenting with non-deterministic test cases)
									/* Interesting values:

| Purpose                                   | (x)               | (y)               | (z)               | Notes                                                                           |
| ----------------------------------------- | ----------------- | ----------------- | ----------------- | ------------------------------------------------------------------------------- |
| **Exploration (broad view)**              | ([-3, 3])         | ([-1, 5])         | ([-1, 5])         | Shows how the function grows large and steep outside the valley.                |
| **Focused optimization testing**          | ([0, 2])          | ([0, 2])          | ([0, 2])          | Focuses on region around the minimum — ideal for Monte Carlo convergence plots. |
| **High-resolution contour visualization** | ([-1.5, 1.5])     | ([0, 2])          | ([0, 2])          | Best for plotting slices and seeing the curvature of the valley.                |
| **Stress testing**                        | ([-2.048, 2.048]) | ([-2.048, 2.048]) | ([-2.048, 2.048]) | Tests the function's behavior over a wider range, useful for robustness checks. |
*/
									let tmpRosenbrockDataSourceObject = {};
									let tmpRosenbrockDataDestinationObject = {};
									let tmpRosenbrockParserResultsObject = {};
									let tmpRosenbrockResult = _Parser.solve('RosenbrockResult = MONTECARLO SAMPLECOUNT 5000 VAR x PT x -3 PT x 3 VAR y PT y -1 PT y 5 VAR z PT z -1 PT z 5 : (1 - x)^2 + 100 * (y - x^2)^2 + (z - y)^2', tmpRosenbrockDataSourceObject, tmpRosenbrockParserResultsObject, tmpManifest, tmpRosenbrockDataDestinationObject);

									Expect(tmpRosenbrockResult).to.exist;
									Expect(tmpRosenbrockResult.Samples.length).to.equal(5000);

									// Build a histogram of the results to see how many are near zero
									let tmpHistogram = [];
									for (let sampleIndex = 0; sampleIndex < tmpRosenbrockResult.Samples.length; sampleIndex++)
									{
										let tmpSample = tmpRosenbrockResult.Samples[sampleIndex];
										let tmpValue = testFable.Math.roundPrecise(tmpSample, 0);
										if (!tmpHistogram[tmpValue])
											tmpHistogram[tmpValue] = 0;
										tmpHistogram[tmpValue] = tmpHistogram[tmpValue] + 1;
										// Log the output sample for visual inspection
										testFable.log.info(`Rosenbrock Sample ${sampleIndex}: Value: ${tmpSample}, Rounded Value: ${tmpValue} --> Histogram Count: ${tmpHistogram[tmpValue]}`);
									}
									// Output the histogram for visual inspection
									//testFable.ExpressionParser.Messaging.logMessage("Rosenbrock Histogram:");
									let tmpHistogramKeys = Object.keys(tmpHistogram);
									tmpHistogramKeys.sort((a, b) => parseFloat(a) - parseFloat(b));
									for (let i = 0; i < tmpHistogramKeys.length; i++)
									{
										let key = tmpHistogramKeys[i];
										testFable.log.info(`Value: ${key}, Count: ${tmpHistogram[key]}`);
									}
									
									return fDone();
								}
							);
						test
							(
								'Complex Histogram Arithmatic',
								(fDone) =>
								{
									let testFable = new libFable();

									let testCityData = require('./data/cities.json');
									testFable.AppData = { Cities: testCityData };

									// let tmpDistribution = testFable.Math.histogramDistributionByExactValue(testFable.AppData.Cities, 'state');

									// Expect(tmpDistribution.Alabama).to.equal(12);
									// Expect(tmpDistribution.Colorado).to.equal(21);
									// Expect(tmpDistribution.Florida).to.equal(73);
									// Expect(tmpDistribution.Georgia).to.equal(18);

									// Now through the solver

									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');

									testFable.AppData.Value1 = "100"; // Comment
									testFable.AppData.Value2 = "-80.5"; // Comment
									testFable.AppData.Value3 = "10000"; // Comment
									testFable.AppData.Value4 = "-333.333"; // Comment
									testFable.AppData.Value5 = "0"; // Comment

									let tmpResultsObject = {};
									let tmpDestinationObject = {};

									_Parser.solve('DistributionResult = distributionhistogram("AppData.Cities", "state")', testFable, tmpResultsObject, false, tmpDestinationObject);
									_Parser.solve('AggregationResult = aggregationHistogram("AppData.Cities", "state", "population")', testFable, tmpResultsObject, false, tmpDestinationObject);
									_Parser.solve('PopSum = sum(flatten(AppData.Cities[].population, AppData.Cities[].latitude))', testFable, tmpResultsObject, false, tmpDestinationObject);

									//_Parser.solve('MadeUpValueArray = ROUND(AVG(createarrayfromabsolutevalues(100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100)),2)', testFable, tmpResultsObject, false, tmpDestinationObject);
									//Expect(tmpDestinationObject.MadeUpValueArray).to.equal('600');
									_Parser.solve('MadeUpValueArray = ROUND(AVG(createarrayfromabsolutevalues(AppData.Value1, AppData.Value2, AppData.Value3, AppData.Value4, AppData.Value5)),2)', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.MadeUpValueArray).to.equal('1937.23');

									_Parser.solve('MadeUpValueArray = ROUND(AVG(cleanvaluearray(createarrayfromabsolutevalues(AppData.Value1, AppData.Value2, AppData.Value3, AppData.Value4, AppData.Value5), 1)),2)', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.MadeUpValueArray).to.equal('2421.54');

									//						_Parser.solve('MadeUpValueArray = ROUND(AVG(createarrayfromabsolutevalues(100, -80.5, 10000, -333.333, 0)),2)', testFable, tmpResultsObject, false, tmpDestinationObject);
									//						Expect(tmpDestinationObject.MadeUpValueArray).to.equal('600');


									_Parser.solve('MadeUpValueArray = ROUND(AVG(createarrayfromabsolutevalues(100, 10, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100)),2)', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.MadeUpValueArray).to.equal('550.83');

									// _Parser.solve('MadeUpValueArray = ROUND(AVG(createarrayfromabsolutevalues(-5, 5, 0, -10, 10, -25, 25, -50, 50)),2)', testFable, tmpResultsObject, false, tmpDestinationObject);
									// Expect(tmpDestinationObject.MadeUpValueArray).to.equal('25');


									Expect(tmpDestinationObject.DistributionResult.Alabama).to.equal(12);
									Expect(tmpDestinationObject.DistributionResult.Colorado).to.equal(21);

									Expect(tmpDestinationObject.AggregationResult.Alabama).to.equal('1279813');
									Expect(tmpDestinationObject.PopSum).to.equal(testCityData.reduce((sum, city) => testFable.Math.addPrecise(city.population, sum), '0'));

									return fDone();
								}
							);
						test
							(
								'Bezier Curve Functions',
								(fDone) =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');

									let tmpResultsObject = {};
									let tmpDestinationObject = {};

									// Test bezierPoint through the expression parser
									// bezierPoint(P0, P1, P2, P3, t) at t=0 should return P0
									_Parser.solve('PointAtZero = BEZIERPOINT(0, 10, 20, 30, 0)', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.PointAtZero).to.equal('0');

									// bezierPoint at t=1 should return P3
									_Parser.solve('PointAtOne = BEZIERPOINT(0, 10, 20, 30, 1)', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.PointAtOne).to.equal('30');

									// bezierPoint at t=0.5 for a linear distribution P0=0, P1=10, P2=20, P3=30
									_Parser.solve('PointAtHalf = BEZIERPOINT(0, 10, 20, 30, 0.5)', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.PointAtHalf).to.equal('15');

									// Test bezierCurveFit through the expression parser with data arrays
									testFable.AppData =
									{
										XValues: [0, 1, 2, 3],
										YValues: [0, 1, 2, 3]
									};

									_Parser.solve('FitResult = BEZIERCURVEFIT(AppData.XValues, AppData.YValues)', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.FitResult).to.be.an('array');
									Expect(tmpDestinationObject.FitResult.length).to.equal(4);
									// P0 should be [0, 0]
									Expect(tmpDestinationObject.FitResult[0][0]).to.equal('0');
									Expect(tmpDestinationObject.FitResult[0][1]).to.equal('0');
									// P3 should be [3, 3]
									Expect(tmpDestinationObject.FitResult[3][0]).to.equal('3');
									Expect(tmpDestinationObject.FitResult[3][1]).to.equal('3');

									return fDone();
								}
							);
						test
							(
								'plumbing histogram into aggregation',
								() =>
								{
									let testFable = new libFable();

									let testCityData = require('./data/cities.json');
									testFable.AppData = { Cities: testCityData };

									// Now through the solver

									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
									let tmpResultsObject = {};
									testFable.AppData.ResultsObject = tmpResultsObject;
									let tmpDestinationObject = {};
									testFable.AppData.DestinationObject = tmpDestinationObject;

									_Parser.solve('DistributionResult = distributionhistogram("AppData.Cities", "state")', testFable, tmpResultsObject, false, tmpDestinationObject);
									_Parser.solve('AggregationResult = aggregationHistogram("AppData.Cities", "state", "population")', testFable, tmpResultsObject, false, tmpDestinationObject);

									Expect(tmpDestinationObject.DistributionResult.Alabama).to.equal(12);
									Expect(tmpDestinationObject.DistributionResult.Colorado).to.equal(21);

									Expect(tmpDestinationObject.AggregationResult.Alabama).to.equal('1279813');

									_Parser.solve('SumByAddress = SUM(FLATTEN(AppData.DestinationObject.AggregationResult))', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.SumByAddress).to.equal(testCityData.reduce((sum, city) => testFable.Math.addPrecise(city.population, sum), '0'));

									_Parser.solve('Smallest = smallestinset(AppData.Cities[], "population")', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.Smallest.population).to.equal('36877');

									_Parser.solve('Largest = largestinset(AppData.Cities[], "population")', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.Largest.city).to.equal('New York');

									_Parser.solve('Tenth = entryinset(AppData.Cities[], "population", "-10")', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.Tenth.city).to.equal('San Jose');

									_Parser.solve('TenthNum = entryinset(AppData.Cities[], "population", -10)', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.TenthNum.city).to.equal('San Jose');

									_Parser.solve('TenthNumHacked = entryinset(AppData.Cities[], "population", (10 * -1))', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.TenthNumHacked.city).to.equal('San Jose');
								}
							);
					}
				);
			suite
				(
					'Data Expressions',
					function ()
					{
						test
							(
								'Concatenates Strings',
								() =>
								{
									let testFable = new libFable();

									let testCityData = require('./data/cities.json');
									testFable.AppData =
									{
										Cities: testCityData.slice(0, 4),
										CityNames: testCityData.slice(0, 4).map((c) => c.city),
										Null: null,
									};
									testFable.AppData.CityNames[2] = {};
									testFable.AppData.Cities[2].city = { cat: '12345', dog: 'waffle' };

									// Now through the solver

									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
									let tmpResultsObject = {};
									let tmpDestinationObject = {};

									_Parser.solve('Names = concat(AppData.Cities[].city)', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.Names).to.equal('New YorkLos AngelesHouston');

									_Parser.solve('Names2 = concat(AppData.CityNames)', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.Names2).to.equal('New YorkLos AngelesHouston');

									_Parser.solve('RawNames = concatRaw(AppData.CityNames)', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.RawNames).to.equal('New YorkLos Angeles[object Object]Houston');

									_Parser.solve('JoinedNames = join("&comma; ", AppData.CityNames)', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.JoinedNames).to.equal('New York&comma; Los Angeles&comma; Houston');

									_Parser.solve('RawJoinedNames = joinRaw(" ", AppData.CityNames)', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.RawJoinedNames).to.equal('New York Los Angeles [object Object] Houston');

									_Parser.solve('NamesArgs = concat("cat", "dog", "waffle")', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.NamesArgs).to.equal('catdogwaffle');

									_Parser.solve('NamesArgs = concat("cat", AppData.Cities[0].city, {AppData.Cities[1].city})', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.NamesArgs).to.equal('catNew YorkLos Angeles');

									testFable.AppData.CityName = 'New York';
									_Parser.solve('RawNamesArgs = concatRaw(AppData.CityName, "arg name")', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.RawNamesArgs).to.equal('New Yorkarg name');

									_Parser.solve('JoinedNamesArgs = join("&comma; ", AppData.CityNames[1], AppData.CityNames[2])', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.JoinedNamesArgs).to.equal('Los Angeles');

									_Parser.solve('RawJoinedNamesArgs = joinRaw(" ", AppData.Cities[].city, "My Extra City")', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.RawJoinedNamesArgs).to.equal('New York Los Angeles [object Object] Houston My Extra City');
								}
							);
					}
				);
			suite
				(
					'Conditional Expressions',
					function ()
					{
						test
							(
								'Conditional When',
								() =>
								{
									let testFable = new libFable();

									let testCityData = require('./data/cities.json');
									testFable.AppData =
									{
										Cities: testCityData.slice(0, 4),
										Null: null,
									};

									// Now through the solver
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
									let tmpResultsObject = {};
									let tmpDestinationObject = {};

									_Parser.solve('Name = When(AppData.Cities[0].city, AppData.Cities[0].city)', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.Name).to.equal('New York');

									_Parser.solve('Overrun = When(AppData.Cities[10000000].city, AppData.Cities[10000000].city)', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.Overrun).to.equal('');

									testFable.AppData.ECDMonth = 'January';
									testFable.AppData.ECDYear = '2023';
									_Parser.solve('EstimatedCompletionDate = ResolveHtmlEntities(When(AppData.ECDMonth, Join("&comma; ", AppData.ECDMonth, AppData.ECDYear)))',
										testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.EstimatedCompletionDate).to.equal('January, 2023');
								}
							);

						test
							(
								'Conditional If',
								() =>
								{
									let testFable = new libFable();

									let testCityData = require('./data/cities.json');
									testFable.AppData =
									{
										Cities: testCityData.slice(0, 4),
										Null: null,
									};

									// Now through the solver
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
									let tmpResultsObject = {};
									let tmpDestinationObject = {};

									_Parser.solve('GTE = If(AppData.Cities[0].latitude, "<", "50", "west", "east")', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.GTE).to.equal('west');

									_Parser.solve('Equals = If(AppData.Cities[0].city, "==", "New York", "yes", "no")', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.Equals).to.equal('yes');

									_Parser.solve('EpsilonEquals = If("1.0000000001", "==", "1", "yes", "no")', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.EpsilonEquals).to.equal('yes');

									_Parser.solve('PreciseEquals = If("1.0000000001", "===", "1", "yes", "no")', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.PreciseEquals).to.equal('no');

									_Parser.solve('Computed = If(AppData.Cities[0].latitude, "<", "50", AppData.Cities[0].latitude + 25, AppData.Cities[0].latitude - 25)', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.Computed).to.equal(testFable.Math.addPrecise(testFable.AppData.Cities[0].latitude, 25));
								}
							);

						test('Solver Quoted Empty Strings', () =>
						{
							const tmpSourceData =
							{
							};
							let testFable = new libFable();
							let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');

							let tmpSolverResults = {};

							_Parser.solve('Taco = 3', tmpSourceData, {}, false, tmpSourceData);
							Expect(tmpSourceData.Taco).to.equal('3');

							_Parser.solve('Taco = ""', tmpSourceData, tmpSolverResults, false, tmpSourceData);
							Expect(tmpSourceData.Taco).to.equal('');

							Expect(_Parser.solve('Taco = " "', tmpSourceData, tmpSolverResults, false, tmpSourceData)).to.equal(' ');
							Expect(_Parser.solve('Taco = "Whooo"', tmpSourceData, tmpSolverResults, false, tmpSourceData)).to.equal('Whooo');
						});
						test('Solver Performance', () =>
						{
							const tmpSourceData =
							{
								MethodAB_WWD_Dry_MinMoistureContent: -150,
								MethodAB_WWD_Dry_MaxMoistureContent: -18.3,
							};
							const tmpExpr = 'MethodAB_WWD_Dry_PlotXValues = SERIES FROM MethodAB_WWD_Dry_MinMoistureContent TO MethodAB_WWD_Dry_MaxMoistureContent STEP 0.1 : n + 0';
							let testFable = new libFable();
							let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');

							const t0 = performance.now();
							// Execute the expression multiple times to get a measurable time
							_Parser.solve(tmpExpr, tmpSourceData, {}, false, tmpSourceData);
							const t1 = performance.now();
							const duration = t1 - t0;
							testFable.log.info(`Solver Performance Test: Executed in ${duration} milliseconds.`);
							Expect(tmpSourceData.MethodAB_WWD_Dry_PlotXValues.length).to.equal(1318);
							Expect(tmpSourceData.MethodAB_WWD_Dry_PlotXValues[0]).to.equal('-150');
							Expect(tmpSourceData.MethodAB_WWD_Dry_PlotXValues[1317]).to.equal('-18.3');
							Expect(duration).to.be.below(100);
						});
						test
							(
								'Custom Solver Functions',
								(fNext) =>
								{
									let testFable = new libFable();

									testFable.MonkeyFunction = (pParameter) => { return `Monkey says hello to ${pParameter}`; };

									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
									let tmpResultsObject = {};
									let tmpDestinationObject = {};

									_Parser.addSolverFunction('monkeypatchedfunction', 'fable.MonkeyFunction', 'This is just for documentation.');
									
									_Parser.solve('MonkeyResult = monkeypatchedfunction("Jerry")', testFable, tmpResultsObject, false, tmpDestinationObject);
									Expect(tmpDestinationObject.MonkeyResult).to.equal('Monkey says hello to Jerry');
									return fNext();
								}
							);

						test
							(
								'Series + Regression',
								() =>
								{
									let testFable = new libFable();

									let testCityData = require('./data/cities.json');
									testFable.AppData =
									{
										Cities: testCityData.slice(0, 4),
										Null: null,
									};

									// Now through the solver
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');

									_Parser.solve('Coefficients = LINEST(FLATTEN(AppData.Cities[].latitude), FLATTEN(AppData.Cities[].population))', testFable, testFable.AppData, false, testFable.AppData);
									testFable.log.info('Regression Coefficients:', testFable.AppData.Coefficients);
									_Parser.solve('SeriesFromCoefficients = SERIES FROM 100 TO 1000 STEP 100 : AppData.Coefficients[0] + n * AppData.Coefficients[1]', testFable, testFable.AppData, false, testFable.AppData);
									testFable.log.info('Series From Coefficients Result:', testFable.AppData.SeriesFromCoefficients);
									_Parser.solve('IntegratedSeries = SUM(FLATTEN(AppData.SeriesFromCoefficients))', testFable, testFable.AppData, false, testFable.AppData);
									testFable.log.info('Integrated Series Result:', testFable.AppData.IntegratedSeries);

									const tmpRawData =
									{
										"StandardSelector": "English",
										"MaxDryDensityTable": [
											{
												"MaxDryDensityTable": {
													"f": "4.19",
													"g": "125.7",
													"j": "0.19",
													"l": "109.1",
													"NTest": "",
													"a": "",
													"b": "",
													"d": "13.51",
													"e": "9.32",
													"h": "1.44",
													"i": "1.25",
													"k": "15.2"
												},
												"MaxDryDensityTablec": "10.00"
											},
											{
												"MaxDryDensityTable": {
													"f": "4.01",
													"g": "120.3",
													"j": "0.16",
													"l": "106.5",
													"NTest": "",
													"a": "",
													"b": "",
													"d": "13.34",
													"e": "9.33",
													"h": "1.39",
													"i": "1.23",
													"k": "13"
												},
												"MaxDryDensityTablec": "11.00"
											},
											{
												"MaxDryDensityTable": {
													"f": "4.19",
													"g": "125.7",
													"j": "0.22",
													"l": "106",
													"NTest": "",
													"a": "",
													"b": "",
													"d": "13.51",
													"e": "9.32",
													"h": "1.40",
													"i": "1.18",
													"k": "18.6"
												},
												"MaxDryDensityTablec": "12.00"
											}
										],
										"NuclearTable": [
											{
												"NuclearTable": {},
												"NDD": "0",
												"ADD": "0",
												"NuclearPercentPR": "0"
											}
										],
										"Pulverization": [
											{
												"PTestNo": "1"
											}
										],
										"FMC": [
											{
												"MassOfWater": "0"
											}
										],
										"MetaTemplate": {},
										"Header": {},
										"SM": {
											"SF": "0",
											"SI": "0",
											"SJ": "0"
										},
										"NM": {},
										"Chart": {
											"Slope": "1.18181818181818181818",
											"Intercept": "91.136363636363636363664",
											"MCZeroAtDD": "21.830887491264849755",
											"ShiftToParallel": "3.230887491264849755",
											"WetSideY2": "0.84615384615384615385",
											"WetSideY1": "-36.84746008708272859272",
											"DomainBegin": "13",
											"DomainEnd": "18.6",
											"WetSideY0": "-6240",
											"OptimalMoistureContent": "16.27122843513086489567",
											"DryCount": 16,
											"WetCount": "16",
											"TotalCount": "32",
											"StartPlot": "12",
											"XValues": [
												"13.2",
												"13.4",
												"13.6",
												"13.8",
												"14",
												"14.2",
												"14.4",
												"14.6",
												"14.8",
												"15",
												"15.2",
												"15.4",
												"15.6",
												"15.8",
												"16",
												"16.2",
												"16.4",
												"16.6",
												"16.8",
												"17",
												"17.2",
												"17.4",
												"17.6",
												"17.8",
												"18",
												"18.2",
												"18.4",
												"18.6",
												"18.8",
												"19",
												"19.2",
												"19.4",
											],
											"PrimaryRoot": "110.3659972415182948767",
											"WetCountIntermediate": "43",
											"ValueLimit": "28"
										},
										"Result": "",
										"FamilyOfCurvesZone": "0.99",
										"MaxDryDensityEnglish": "0",
										"MaxDryDensityMetric": "0",
										"DryX": "15.2",
										"DryY": "109.1",
										"AsIsX": "13",
										"AsIsY": "106.5",
										"WetX": "18.6",
										"WetY": "106",
										"AverageMaxDryDensity": "11",
										"OptimumMoistureOfTotalMaterial": "0.1",
										"om": "0.0",
										"pr": "0.0"
									};

									const tmpBaseMoistures = tmpRawData.Chart.XValues;
									//TODO: compute this form above; 3 stages; dry, wet, combined
									const tmpCombinedDensities = [ '106.7363636','106.9727273','107.2090909','107.4454545','107.6818182','107.9181818',
										'108.1545455','108.3909091','108.6272727','108.8636364','109.1','109.3363636','109.5727273','109.8090909','110.0454545',
										'110.2818182','110.1152028','109.7279363','109.3433842','108.9615182','108.5823101','108.2057322','107.8317574',
										'107.4603587','107.0915096','106.7251839','106.3613559','106','105.6410912','105.2846046','104.9305159','104.5788009'
									];
									const tmpMatrix = [];
									for (let i = 1; i <= 10; ++i)
									{
										const tmpPowArray = [];
										for (let j = 0; j < tmpBaseMoistures.length; ++j)
										{
											tmpPowArray.push(testFable.Math.powerPrecise(tmpBaseMoistures[j], i));
										}
										tmpMatrix.push(tmpPowArray);
									}
									testFable.AppData.FitToDensities = tmpCombinedDensities;
									testFable.AppData.MoistureMatrix = tmpMatrix;
									testFable.log.info('Fit To Densities:', testFable.AppData.FitToDensities);
									testFable.log.info('Moisture Matrix:', testFable.AppData.MoistureMatrix);
									_Parser.solve('LinearRegressionHand = LINEST(AppData.MoistureMatrix, AppData.FitToDensities)', testFable, testFable.AppData, false, testFable.AppData);
									testFable.log.info('Density Regression Coefficients:', testFable.AppData.LinearRegressionHand);

									const tmpSolverInstructions =
									[
										'ChartDomainBegin = MaxDryDensityTable[0].MaxDryDensityTable.k - 2',
										'ChartDomainEnd = ChartDomainBegin + (Chart.TotalCount - 1) * 0.2',
										'XValues = SERIES FROM ChartDomainBegin TO ChartDomainEnd STEP 0.2 : n + 0',
										'DryCount = MATCH(Chart.OptimalMoistureContent, XValues)',
										'WetCountIntermediate = 60 - DryCount',
										'WetCount = IF(DryCount, "<=", 30, DryCount, WetCountIntermediate)',
										'TotalCount = DryCount + WetCount',
										'StartPlot = DryCount - 5',
										'ChartValueLimit = Chart.XValues.length - 1',
										'DryValues = MAP VAR x FROM Chart.XValues : x * Chart.Slope + Chart.Intercept',
										'WetValues = MAP VAR x FROM Chart.XValues : 6240 / (x + 100 / 2.7 + Chart.ShiftToParallel)',
										'CombinedValues = MAP VAR dry FROM DryValues VAR wet FROM WetValues VAR x from XValues : IF(x, "LTE", Chart.OptimalMoistureContent, dry, wet)',
										'FilteredXValues = MAP VAR x FROM XValues : IF(ABS(Chart.OptimalMoistureContent - x), "LT", 1, x, 0)',
										'XValueMatrix = createarrayfromabsolutevalues(0, 0, 0, 0, 0, 0, 0, 0, 0, 0)', // Create Placeholders
										'XValueMatrix[0] = MAP VAR x FROM XValues : x + 0',
										'XValueMatrix[1] = MAP VAR x FROM XValues : x^2',
										'XValueMatrix[2] = MAP VAR x FROM XValues : x^3',
										'XValueMatrix[3] = MAP VAR x FROM XValues : x^4',
										'XValueMatrix[4] = MAP VAR x FROM XValues : x^5',
										'XValueMatrix[5] = MAP VAR x FROM XValues : x^6',
										'XValueMatrix[6] = MAP VAR x FROM XValues : x^7',
										'XValueMatrix[7] = MAP VAR x FROM XValues : x^8',
										'XValueMatrix[8] = MAP VAR x FROM XValues : x^9',
										'XValueMatrix[9] = MAP VAR x FROM XValues : x^10',
										'LinearRegression = LINEST(XValueMatrix, CombinedValues)',
										'FilteredXValueVectors = MatrixTranspose(XValueMatrix)',
										'FittedDensities = MAP VAR x FROM XValues VAR vector FROM FilteredXValueVectors : PREDICT(LinearRegression, vector)',
										'FilteredDensities = MAP VAR x FROM FilteredXValues VAR prediction FROM FittedDensities : IF(x, "==", 0, 0, prediction)',
									];
									const tmpResultsObject = {};
									for (const tmpInstruction of tmpSolverInstructions)
									{
										_Parser.solve(tmpInstruction, tmpRawData, tmpResultsObject, false, tmpRawData);
										testFable.log.info(`After instruction: ${tmpInstruction}`, tmpRawData[tmpInstruction.split('=')[0].trim()]);
									}

									Expect(tmpRawData.FilteredDensities[10]).to.equal('0');
									Expect(Number(tmpRawData.FilteredDensities[11])).to.be.closeTo(109.3, 0.1);
									Expect(Number(tmpRawData.FilteredDensities[20])).to.be.closeTo(108.6, 0.1);
									Expect(tmpRawData.FilteredDensities[21]).to.equal('0');

									/*
									testFable.log.info('linest payload (hand):', { MoistureMatrix: testFable.AppData.MoistureMatrix, FitToDensities: testFable.AppData.FitToDensities });
									testFable.log.info('linest payload (solver):', { XValueMatrix: tmpRawData.XValueMatrix, CombinedValues: tmpRawData.CombinedValues });

									testFable.log.info('coefficients (hand):', testFable.AppData.LinearRegressionHand);
									testFable.log.info('coefficients (solver):', tmpRawData.LinearRegression);

									testFable.log.info('filtered densities (solver):', tmpRawData.FilteredDensities);
									*/
								}
							);
						test
							(
								'Slope and Intercept (Excel SLOPE/INTERCEPT equivalents)',
								() =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');

									// Direct Math service tests
									// Known data: y = 2x + 1 (slope=2, intercept=1)
									let tmpXValues = [1, 2, 3, 4, 5];
									let tmpYValues = [3, 5, 7, 9, 11];

									let tmpSlope = testFable.Math.slopePrecise(tmpYValues, tmpXValues);
									Expect(tmpSlope).to.equal('2');

									let tmpIntercept = testFable.Math.interceptPrecise(tmpYValues, tmpXValues);
									Expect(tmpIntercept).to.equal('1');

									// Test with non-perfect linear data (Excel example)
									// x: 1, 2, 3, 4, 5
									// y: 2, 4, 5, 4, 5
									let tmpXValues2 = [1, 2, 3, 4, 5];
									let tmpYValues2 = [2, 4, 5, 4, 5];

									let tmpSlope2 = testFable.Math.slopePrecise(tmpYValues2, tmpXValues2);
									Expect(Number(tmpSlope2)).to.be.closeTo(0.6, 0.0001);

									let tmpIntercept2 = testFable.Math.interceptPrecise(tmpYValues2, tmpXValues2);
									Expect(Number(tmpIntercept2)).to.be.closeTo(2.2, 0.0001);

									// Edge case: single point
									let tmpSlopeSingle = testFable.Math.slopePrecise([5], [3]);
									Expect(tmpSlopeSingle).to.equal('0');

									// Through the expression parser with set concatenation
									testFable.AppData =
									{
										XData: [1, 2, 3, 4, 5],
										YData: [3, 5, 7, 9, 11]
									};

									let tmpSolverResult = {};
									_Parser.solve('SlopeResult = SLOPE(AppData.YData, AppData.XData)', testFable, tmpSolverResult, false, tmpSolverResult);
									Expect(tmpSolverResult.SlopeResult).to.equal('2');

									_Parser.solve('InterceptResult = INTERCEPT(AppData.YData, AppData.XData)', testFable, tmpSolverResult, false, tmpSolverResult);
									Expect(tmpSolverResult.InterceptResult).to.equal('1');

									// Solver with inline scalars (split in half: first 5 = Y, last 5 = X)
									let tmpInlineResult = {};
									_Parser.solve('InlineSlope = SLOPE(3,5,7,9,11, 1,2,3,4,5)', testFable, tmpInlineResult, false, tmpInlineResult);
									Expect(tmpInlineResult.InlineSlope).to.equal('2');

									_Parser.solve('InlineIntercept = INTERCEPT(3,5,7,9,11, 1,2,3,4,5)', testFable, tmpInlineResult, false, tmpInlineResult);
									Expect(tmpInlineResult.InlineIntercept).to.equal('1');

									// Solver chain: SERIES produces string arrays, then SLOPE/INTERCEPT consume them
									let tmpChainData = {};
									_Parser.solve('XValues = SERIES FROM 1 TO 5 STEP 1 : n + 0', tmpChainData, {}, false, tmpChainData);
									_Parser.solve('YValues = SERIES FROM 1 TO 5 STEP 1 : 2 * n + 1', tmpChainData, {}, false, tmpChainData);
									// Verify the arrays are string-typed (expression parser produces strings)
									Expect(tmpChainData.XValues[0]).to.equal('1');
									Expect(typeof tmpChainData.XValues[0]).to.equal('string');
									Expect(tmpChainData.YValues[0]).to.equal('3');
									Expect(typeof tmpChainData.YValues[0]).to.equal('string');

									_Parser.solve('ChainSlope = SLOPE(YValues, XValues)', tmpChainData, {}, false, tmpChainData);
									Expect(tmpChainData.ChainSlope).to.equal('2');

									_Parser.solve('ChainIntercept = INTERCEPT(YValues, XValues)', tmpChainData, {}, false, tmpChainData);
									Expect(tmpChainData.ChainIntercept).to.equal('1');

									// String arrays at AppData addresses
									testFable.AppData.XStrings = ['1', '2', '3', '4', '5'];
									testFable.AppData.YStrings = ['3', '5', '7', '9', '11'];
									_Parser.solve('StringSlope = SLOPE(AppData.YStrings, AppData.XStrings)', testFable, tmpSolverResult, false, tmpSolverResult);
									Expect(tmpSolverResult.StringSlope).to.equal('2');

									_Parser.solve('StringIntercept = INTERCEPT(AppData.YStrings, AppData.XStrings)', testFable, tmpSolverResult, false, tmpSolverResult);
									Expect(tmpSolverResult.StringIntercept).to.equal('1');

									// Solver with non-perfect data
									testFable.AppData.YData2 = [2, 4, 5, 4, 5];
									_Parser.solve('Slope2 = SLOPE(AppData.YData2, AppData.XData)', testFable, tmpSolverResult, false, tmpSolverResult);
									Expect(Number(tmpSolverResult.Slope2)).to.be.closeTo(0.6, 0.0001);

									_Parser.solve('Intercept2 = INTERCEPT(AppData.YData2, AppData.XData)', testFable, tmpSolverResult, false, tmpSolverResult);
									Expect(Number(tmpSolverResult.Intercept2)).to.be.closeTo(2.2, 0.0001);

									// Verify slope and intercept reconstruct the regression line
									_Parser.solve('Predicted = ChainIntercept + ChainSlope * 6', tmpChainData, {}, false, tmpChainData);
									Expect(tmpChainData.Predicted).to.equal('13');
								}
							);
					}
				);
			suite
				(
					'Multi-Row Map Expressions',
					function ()
					{
						test
							(
								'Test basic MULTIROWMAP with current row',
								(fDone) =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
									let tmpManifest = testFable.newManyfest();

									let tmpDataSourceObject = {
										Rows: [
											{ Width: 10, Height: 20 },
											{ Width: 30, Height: 40 },
											{ Width: 50, Height: 60 },
										]
									};
									let tmpDataDestinationObject = {};

									// Simple: reference current row values (OFFSET 0 is default)
									let tmpResult = _Parser.solve(
										'Areas = MULTIROWMAP ROWS FROM Rows VAR w FROM Width VAR h FROM Height : w * h',
										tmpDataSourceObject, {}, tmpManifest, tmpDataDestinationObject);

									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.equal(3);
									Expect(tmpResult[0]).to.equal('200');
									Expect(tmpResult[1]).to.equal('1200');
									Expect(tmpResult[2]).to.equal('3000');

									return fDone();
								}
							);
						test
							(
								'Test MULTIROWMAP with previous row lookback (OFFSET -1)',
								(fDone) =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
									let tmpManifest = testFable.newManyfest();

									let tmpDataSourceObject = {
										Rows: [
											{ Value: 100 },
											{ Value: 200 },
											{ Value: 300 },
											{ Value: 400 },
										]
									};
									let tmpDataDestinationObject = {};

									// Reference the current row and the previous row's value
									let tmpResult = _Parser.solve(
										'Deltas = MULTIROWMAP ROWS FROM Rows VAR Current FROM Value OFFSET 0 VAR Previous FROM Value OFFSET -1 DEFAULT 0 : Current - Previous',
										tmpDataSourceObject, {}, tmpManifest, tmpDataDestinationObject);

									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.equal(4);
									// Row 0: 100 - 0 (default) = 100
									Expect(tmpResult[0]).to.equal('100');
									// Row 1: 200 - 100 = 100
									Expect(tmpResult[1]).to.equal('100');
									// Row 2: 300 - 200 = 100
									Expect(tmpResult[2]).to.equal('100');
									// Row 3: 400 - 300 = 100
									Expect(tmpResult[3]).to.equal('100');

									return fDone();
								}
							);
						test
							(
								'Test MULTIROWMAP with two-row lookback (OFFSET -2)',
								(fDone) =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
									let tmpManifest = testFable.newManyfest();

									let tmpDataSourceObject = {
										Rows: [
											{ Value: 5 },
											{ Value: 10 },
											{ Value: 20 },
											{ Value: 35 },
											{ Value: 55 },
										]
									};
									let tmpDataDestinationObject = {};

									// Second derivative: current - 2*previous + two-back
									let tmpResult = _Parser.solve(
										'SecondDeriv = MULTIROWMAP ROWS FROM Rows VAR Current FROM Value OFFSET 0 VAR Prev FROM Value OFFSET -1 DEFAULT 0 VAR TwoBack FROM Value OFFSET -2 DEFAULT 0 : Current - 2 * Prev + TwoBack',
										tmpDataSourceObject, {}, tmpManifest, tmpDataDestinationObject);

									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.equal(5);
									// Row 0: 5 - 2*0 + 0 = 5
									Expect(tmpResult[0]).to.equal('5');
									// Row 1: 10 - 2*5 + 0 = 0
									Expect(tmpResult[1]).to.equal('0');
									// Row 2: 20 - 2*10 + 5 = 5
									Expect(tmpResult[2]).to.equal('5');
									// Row 3: 35 - 2*20 + 10 = 5
									Expect(tmpResult[3]).to.equal('5');
									// Row 4: 55 - 2*35 + 20 = 5
									Expect(tmpResult[4]).to.equal('5');

									return fDone();
								}
							);
						test
							(
								'Test MULTIROWMAP with three-row lookback (OFFSET -3)',
								(fDone) =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
									let tmpManifest = testFable.newManyfest();

									let tmpDataSourceObject = {
										Rows: [
											{ Value: 1 },
											{ Value: 2 },
											{ Value: 4 },
											{ Value: 8 },
											{ Value: 16 },
										]
									};
									let tmpDataDestinationObject = {};

									// Sum of current + three rows back
									let tmpResult = _Parser.solve(
										'ThreeBackSum = MULTIROWMAP ROWS FROM Rows VAR Current FROM Value VAR ThreeBack FROM Value OFFSET -3 DEFAULT 0 : Current + ThreeBack',
										tmpDataSourceObject, {}, tmpManifest, tmpDataDestinationObject);

									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.equal(5);
									// Row 0: 1 + 0 (default, no row at -3) = 1
									Expect(tmpResult[0]).to.equal('1');
									// Row 1: 2 + 0 (default, no row at -2) = 2
									Expect(tmpResult[1]).to.equal('2');
									// Row 2: 4 + 0 (default, no row at -1) = 4
									Expect(tmpResult[2]).to.equal('4');
									// Row 3: 8 + 1 (row 0) = 9
									Expect(tmpResult[3]).to.equal('9');
									// Row 4: 16 + 2 (row 1) = 18
									Expect(tmpResult[4]).to.equal('18');

									return fDone();
								}
							);
						test
							(
								'Test MULTIROWMAP Fibonacci sequence',
								(fDone) =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
									let tmpManifest = testFable.newManyfest();

									// Fibonacci: each row = sum of two previous rows
									// Seed: first two rows have the starting values
									let tmpDataSourceObject = {
										FibRows: [
											{ Fib: 0 },
											{ Fib: 1 },
											{ Fib: 1 },
											{ Fib: 2 },
											{ Fib: 3 },
											{ Fib: 5 },
											{ Fib: 8 },
											{ Fib: 13 },
										]
									};
									let tmpDataDestinationObject = {};

									// Verify: for each row, check that Current == Prev1 + Prev2 (except seed rows)
									let tmpResult = _Parser.solve(
										'FibCheck = MULTIROWMAP ROWS FROM FibRows VAR Current FROM Fib VAR Prev1 FROM Fib OFFSET -1 DEFAULT 0 VAR Prev2 FROM Fib OFFSET -2 DEFAULT 0 : Current - (Prev1 + Prev2)',
										tmpDataSourceObject, {}, tmpManifest, tmpDataDestinationObject);

									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.equal(8);
									// Row 0: 0 - (0 + 0) = 0 (seed)
									Expect(tmpResult[0]).to.equal('0');
									// Row 1: 1 - (0 + 0) = 1 (seed)
									Expect(tmpResult[1]).to.equal('1');
									// Row 2 onwards should all be 0 since each is the sum of previous two
									Expect(tmpResult[2]).to.equal('0');
									Expect(tmpResult[3]).to.equal('0');
									Expect(tmpResult[4]).to.equal('0');
									Expect(tmpResult[5]).to.equal('0');
									Expect(tmpResult[6]).to.equal('0');
									Expect(tmpResult[7]).to.equal('0');

									return fDone();
								}
							);
						test
							(
								'Test MULTIROWMAP with custom default values',
								(fDone) =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
									let tmpManifest = testFable.newManyfest();

									let tmpDataSourceObject = {
										Rows: [
											{ Value: 10 },
											{ Value: 20 },
											{ Value: 30 },
										]
									};
									let tmpDataDestinationObject = {};

									// Use negative default for previous row
									let tmpResult = _Parser.solve(
										'WithDefaults = MULTIROWMAP ROWS FROM Rows VAR Current FROM Value VAR Previous FROM Value OFFSET -1 DEFAULT -1 : Current + Previous',
										tmpDataSourceObject, {}, tmpManifest, tmpDataDestinationObject);

									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.equal(3);
									// Row 0: 10 + (-1) = 9
									Expect(tmpResult[0]).to.equal('9');
									// Row 1: 20 + 10 = 30
									Expect(tmpResult[1]).to.equal('30');
									// Row 2: 30 + 20 = 50
									Expect(tmpResult[2]).to.equal('50');

									return fDone();
								}
							);
						test
							(
								'Test MULTIROWMAP with multiple properties from same row offset',
								(fDone) =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
									let tmpManifest = testFable.newManyfest();

									let tmpDataSourceObject = {
										Measurements: [
											{ Width: 10, Height: 5, Depth: 2 },
											{ Width: 20, Height: 10, Depth: 4 },
											{ Width: 30, Height: 15, Depth: 6 },
											{ Width: 40, Height: 20, Depth: 8 },
										]
									};
									let tmpDataDestinationObject = {};

									// Compare volume change: current volume minus previous volume
									let tmpResult = _Parser.solve(
										'VolumeDelta = MULTIROWMAP ROWS FROM Measurements VAR w FROM Width VAR h FROM Height VAR d FROM Depth VAR pw FROM Width OFFSET -1 DEFAULT 0 VAR ph FROM Height OFFSET -1 DEFAULT 0 VAR pd FROM Depth OFFSET -1 DEFAULT 0 : (w * h * d) - (pw * ph * pd)',
										tmpDataSourceObject, {}, tmpManifest, tmpDataDestinationObject);

									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.equal(4);
									// Row 0: (10*5*2) - (0*0*0) = 100 - 0 = 100
									Expect(tmpResult[0]).to.equal('100');
									// Row 1: (20*10*4) - (10*5*2) = 800 - 100 = 700
									Expect(tmpResult[1]).to.equal('700');
									// Row 2: (30*15*6) - (20*10*4) = 2700 - 800 = 1900
									Expect(tmpResult[2]).to.equal('1900');
									// Row 3: (40*20*8) - (30*15*6) = 6400 - 2700 = 3700
									Expect(tmpResult[3]).to.equal('3700');

									return fDone();
								}
							);
						test
							(
								'Test MULTIROWMAP with stepIndex variable',
								(fDone) =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
									let tmpManifest = testFable.newManyfest();

									let tmpDataSourceObject = {
										Rows: [
											{ Value: 100 },
											{ Value: 200 },
											{ Value: 300 },
										]
									};
									let tmpDataDestinationObject = {};

									// Use stepIndex (row index) in the expression
									let tmpResult = _Parser.solve(
										'Indexed = MULTIROWMAP ROWS FROM Rows VAR v FROM Value : v + stepIndex * 1000',
										tmpDataSourceObject, {}, tmpManifest, tmpDataDestinationObject);

									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.equal(3);
									Expect(tmpResult[0]).to.equal('100');
									Expect(tmpResult[1]).to.equal('1200');
									Expect(tmpResult[2]).to.equal('2300');

									return fDone();
								}
							);
						test
							(
								'Test MULTIROWMAP moving average',
								(fDone) =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
									let tmpManifest = testFable.newManyfest();

									let tmpDataSourceObject = {
										Prices: [
											{ Close: 100 },
											{ Close: 110 },
											{ Close: 105 },
											{ Close: 115 },
											{ Close: 120 },
										]
									};
									let tmpDataDestinationObject = {};

									// 3-period moving average: (current + prev + two-back) / 3
									let tmpResult = _Parser.solve(
										'MA3 = MULTIROWMAP ROWS FROM Prices VAR c0 FROM Close VAR c1 FROM Close OFFSET -1 DEFAULT 0 VAR c2 FROM Close OFFSET -2 DEFAULT 0 : (c0 + c1 + c2) / 3',
										tmpDataSourceObject, {}, tmpManifest, tmpDataDestinationObject);

									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.equal(5);
									// Row 2 onwards has three valid values for a true 3-period MA
									// Row 2: (105 + 110 + 100) / 3 = 105
									Expect(tmpResult[2]).to.equal('105');
									// Row 3: (115 + 105 + 110) / 3 = 110
									Expect(tmpResult[3]).to.equal('110');
									// Row 4: (120 + 115 + 105) / 3 = 113.33...
									Expect(Number(tmpResult[4])).to.be.closeTo(113.333, 0.01);

									return fDone();
								}
							);
						test
							(
								'Test MULTIROWMAP returns undefined for invalid rows address',
								(fDone) =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
									let tmpManifest = testFable.newManyfest();

									let tmpDataSourceObject = {};
									let tmpDataDestinationObject = {};

									// No valid rows
									let tmpResult = _Parser.solve(
										'Bad = MULTIROWMAP ROWS FROM NonExistent VAR v FROM Value : v + 1',
										tmpDataSourceObject, {}, tmpManifest, tmpDataDestinationObject);

									Expect(tmpResult).to.be.undefined;

									return fDone();
								}
							);
						test
							(
								'Test MULTIROWMAP with forward row lookback (positive OFFSET)',
								(fDone) =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
									let tmpManifest = testFable.newManyfest();

									let tmpDataSourceObject = {
										Rows: [
											{ Value: 10 },
											{ Value: 20 },
											{ Value: 30 },
											{ Value: 40 },
											{ Value: 50 },
										]
									};
									let tmpDataDestinationObject = {};

									// Look ahead: current value minus next row's value
									let tmpResult = _Parser.solve(
										'ForwardDelta = MULTIROWMAP ROWS FROM Rows VAR Current FROM Value VAR Next FROM Value OFFSET 1 DEFAULT 0 : Next - Current',
										tmpDataSourceObject, {}, tmpManifest, tmpDataDestinationObject);

									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.equal(5);
									// Row 0: 20 - 10 = 10
									Expect(tmpResult[0]).to.equal('10');
									// Row 1: 30 - 20 = 10
									Expect(tmpResult[1]).to.equal('10');
									// Row 2: 40 - 30 = 10
									Expect(tmpResult[2]).to.equal('10');
									// Row 3: 50 - 40 = 10
									Expect(tmpResult[3]).to.equal('10');
									// Row 4: 0 (default) - 50 = -50
									Expect(tmpResult[4]).to.equal('-50');

									return fDone();
								}
							);
						test
							(
								'Test MULTIROWMAP with forward lookback two rows ahead (OFFSET 2)',
								(fDone) =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
									let tmpManifest = testFable.newManyfest();

									let tmpDataSourceObject = {
										Rows: [
											{ Value: 1 },
											{ Value: 2 },
											{ Value: 3 },
											{ Value: 4 },
											{ Value: 5 },
										]
									};
									let tmpDataDestinationObject = {};

									// Look two ahead
									let tmpResult = _Parser.solve(
										'TwoAhead = MULTIROWMAP ROWS FROM Rows VAR Current FROM Value VAR Future FROM Value OFFSET 2 DEFAULT 99 : Future + Current',
										tmpDataSourceObject, {}, tmpManifest, tmpDataDestinationObject);

									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.equal(5);
									// Row 0: 3 + 1 = 4
									Expect(tmpResult[0]).to.equal('4');
									// Row 1: 4 + 2 = 6
									Expect(tmpResult[1]).to.equal('6');
									// Row 2: 5 + 3 = 8
									Expect(tmpResult[2]).to.equal('8');
									// Row 3: 99 (default) + 4 = 103
									Expect(tmpResult[3]).to.equal('103');
									// Row 4: 99 (default) + 5 = 104
									Expect(tmpResult[4]).to.equal('104');

									return fDone();
								}
							);
						test
							(
								'Test MULTIROWMAP with SERIESSTART to skip initial rows',
								(fDone) =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
									let tmpManifest = testFable.newManyfest();

									let tmpDataSourceObject = {
										Rows: [
											{ Value: 100 },
											{ Value: 200 },
											{ Value: 300 },
											{ Value: 400 },
											{ Value: 500 },
										]
									};
									let tmpDataDestinationObject = {};

									// Start from row 2
									let tmpResult = _Parser.solve(
										'FromRow2 = MULTIROWMAP ROWS FROM Rows SERIESSTART 2 VAR v FROM Value : v + 0',
										tmpDataSourceObject, {}, tmpManifest, tmpDataDestinationObject);

									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.equal(3);
									Expect(tmpResult[0]).to.equal('300');
									Expect(tmpResult[1]).to.equal('400');
									Expect(tmpResult[2]).to.equal('500');

									return fDone();
								}
							);
						test
							(
								'Test MULTIROWMAP with negative SERIESSTART (count from end)',
								(fDone) =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
									let tmpManifest = testFable.newManyfest();

									let tmpDataSourceObject = {
										Rows: [
											{ Value: 10 },
											{ Value: 20 },
											{ Value: 30 },
											{ Value: 40 },
											{ Value: 50 },
										]
									};
									let tmpDataDestinationObject = {};

									// Start from 2 rows before the end
									let tmpResult = _Parser.solve(
										'LastTwo = MULTIROWMAP ROWS FROM Rows SERIESSTART -2 VAR v FROM Value : v + 0',
										tmpDataSourceObject, {}, tmpManifest, tmpDataDestinationObject);

									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.equal(2);
									Expect(tmpResult[0]).to.equal('40');
									Expect(tmpResult[1]).to.equal('50');

									return fDone();
								}
							);
						test
							(
								'Test MULTIROWMAP with SERIESSTEP -1 (iterate backwards)',
								(fDone) =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
									let tmpManifest = testFable.newManyfest();

									let tmpDataSourceObject = {
										Rows: [
											{ Value: 10 },
											{ Value: 20 },
											{ Value: 30 },
											{ Value: 40 },
											{ Value: 50 },
										]
									};
									let tmpDataDestinationObject = {};

									// Iterate backwards from the last row
									let tmpResult = _Parser.solve(
										'Reversed = MULTIROWMAP ROWS FROM Rows SERIESSTART -1 SERIESSTEP -1 VAR v FROM Value : v + 0',
										tmpDataSourceObject, {}, tmpManifest, tmpDataDestinationObject);

									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.equal(5);
									Expect(tmpResult[0]).to.equal('50');
									Expect(tmpResult[1]).to.equal('40');
									Expect(tmpResult[2]).to.equal('30');
									Expect(tmpResult[3]).to.equal('20');
									Expect(tmpResult[4]).to.equal('10');

									return fDone();
								}
							);
						test
							(
								'Test MULTIROWMAP with SERIESSTEP 2 (skip every other row)',
								(fDone) =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
									let tmpManifest = testFable.newManyfest();

									let tmpDataSourceObject = {
										Rows: [
											{ Value: 10 },
											{ Value: 20 },
											{ Value: 30 },
											{ Value: 40 },
											{ Value: 50 },
											{ Value: 60 },
										]
									};
									let tmpDataDestinationObject = {};

									// Every other row
									let tmpResult = _Parser.solve(
										'EveryOther = MULTIROWMAP ROWS FROM Rows SERIESSTEP 2 VAR v FROM Value : v + 0',
										tmpDataSourceObject, {}, tmpManifest, tmpDataDestinationObject);

									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.equal(3);
									Expect(tmpResult[0]).to.equal('10');
									Expect(tmpResult[1]).to.equal('30');
									Expect(tmpResult[2]).to.equal('50');

									return fDone();
								}
							);
						test
							(
								'Test MULTIROWMAP backwards with lookback still works',
								(fDone) =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
									let tmpManifest = testFable.newManyfest();

									let tmpDataSourceObject = {
										Rows: [
											{ Value: 10 },
											{ Value: 20 },
											{ Value: 30 },
											{ Value: 40 },
										]
									};
									let tmpDataDestinationObject = {};

									// Going backwards, previous row (OFFSET -1) means the row with a LOWER index
									// which is actually the next row in reverse iteration order
									let tmpResult = _Parser.solve(
										'BackwardsWithLook = MULTIROWMAP ROWS FROM Rows SERIESSTART -1 SERIESSTEP -1 VAR Current FROM Value VAR Prev FROM Value OFFSET -1 DEFAULT 0 : Current - Prev',
										tmpDataSourceObject, {}, tmpManifest, tmpDataDestinationObject);

									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.equal(4);
									// Row 3 (first in reverse): 40 - 30 = 10
									Expect(tmpResult[0]).to.equal('10');
									// Row 2: 30 - 20 = 10
									Expect(tmpResult[1]).to.equal('10');
									// Row 1: 20 - 10 = 10
									Expect(tmpResult[2]).to.equal('10');
									// Row 0: 10 - 0 (default) = 10
									Expect(tmpResult[3]).to.equal('10');

									return fDone();
								}
							);
						test
							(
								'Test MULTIROWMAP with SERIESSTART and SERIESSTEP combined',
								(fDone) =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
									let tmpManifest = testFable.newManyfest();

									let tmpDataSourceObject = {
										Rows: [
											{ Value: 10 },
											{ Value: 20 },
											{ Value: 30 },
											{ Value: 40 },
											{ Value: 50 },
											{ Value: 60 },
											{ Value: 70 },
											{ Value: 80 },
										]
									};
									let tmpDataDestinationObject = {};

									// Start at row 1, step by 3
									let tmpResult = _Parser.solve(
										'SteppedStart = MULTIROWMAP ROWS FROM Rows SERIESSTART 1 SERIESSTEP 3 VAR v FROM Value : v + 0',
										tmpDataSourceObject, {}, tmpManifest, tmpDataDestinationObject);

									Expect(tmpResult).to.be.an('array');
									// Rows: 1, 4, 7 => Values: 20, 50, 80
									Expect(tmpResult.length).to.equal(3);
									Expect(tmpResult[0]).to.equal('20');
									Expect(tmpResult[1]).to.equal('50');
									Expect(tmpResult[2]).to.equal('80');

									return fDone();
								}
							);
						test
							(
								'Test MULTIROWMAP with both forward and backward lookback simultaneously',
								(fDone) =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
									let tmpManifest = testFable.newManyfest();

									let tmpDataSourceObject = {
										Rows: [
											{ Value: 10 },
											{ Value: 20 },
											{ Value: 30 },
											{ Value: 40 },
											{ Value: 50 },
										]
									};
									let tmpDataDestinationObject = {};

									// Central difference: (next - previous) / 2
									let tmpResult = _Parser.solve(
										'CentralDiff = MULTIROWMAP ROWS FROM Rows VAR Prev FROM Value OFFSET -1 DEFAULT 0 VAR Next FROM Value OFFSET 1 DEFAULT 0 : (Next - Prev) / 2',
										tmpDataSourceObject, {}, tmpManifest, tmpDataDestinationObject);

									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.equal(5);
									// Row 0: (20 - 0) / 2 = 10
									Expect(tmpResult[0]).to.equal('10');
									// Row 1: (30 - 10) / 2 = 10
									Expect(tmpResult[1]).to.equal('10');
									// Row 2: (40 - 20) / 2 = 10
									Expect(tmpResult[2]).to.equal('10');
									// Row 3: (50 - 30) / 2 = 10
									Expect(tmpResult[3]).to.equal('10');
									// Row 4: (0 - 40) / 2 = -20
									Expect(tmpResult[4]).to.equal('-20');

									return fDone();
								}
							);
						test
							(
								'Test MULTIROWMAP with rowIndex and stepIndex variables',
								(fDone) =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
									let tmpManifest = testFable.newManyfest();

									let tmpDataSourceObject = {
										Rows: [
											{ Value: 100 },
											{ Value: 200 },
											{ Value: 300 },
											{ Value: 400 },
											{ Value: 500 },
										]
									};
									let tmpDataDestinationObject = {};

									// With SERIESSTART, rowIndex is the actual array index, stepIndex is the iteration count
									let tmpResult = _Parser.solve(
										'IndexTest = MULTIROWMAP ROWS FROM Rows SERIESSTART 2 VAR v FROM Value : v + rowIndex * 1000 + stepIndex',
										tmpDataSourceObject, {}, tmpManifest, tmpDataDestinationObject);

									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.equal(3);
									// stepIndex=0, rowIndex=2: 300 + 2000 + 0 = 2300
									Expect(tmpResult[0]).to.equal('2300');
									// stepIndex=1, rowIndex=3: 400 + 3000 + 1 = 3401
									Expect(tmpResult[1]).to.equal('3401');
									// stepIndex=2, rowIndex=4: 500 + 4000 + 2 = 4502
									Expect(tmpResult[2]).to.equal('4502');

									return fDone();
								}
							);
						test
							(
								'Test MULTIROWMAP SERIESSTEP zero returns undefined',
								(fDone) =>
								{
									let testFable = new libFable();
									let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
									let tmpManifest = testFable.newManyfest();

									let tmpDataSourceObject = {
										Rows: [{ Value: 1 }]
									};
									let tmpDataDestinationObject = {};

									let tmpResult = _Parser.solve(
										'BadStep = MULTIROWMAP ROWS FROM Rows SERIESSTEP 0 VAR v FROM Value : v + 0',
										tmpDataSourceObject, {}, tmpManifest, tmpDataDestinationObject);

									Expect(tmpResult).to.be.undefined;

									return fDone();
								}
							);
					}
				);
		}
	);

suite
	(
		'Comparison Operators',
		function ()
		{
			suite
				(
					'Greater Than',
					function ()
					{
						test
							(
								'Basic greater than comparisons.',
								(fDone) =>
								{
									let _Parser = getExpressionParser();
									Expect(_Parser.solve('Result = 5 > 3')).to.equal('1');
									Expect(_Parser.solve('Result = 3 > 5')).to.equal('0');
									Expect(_Parser.solve('Result = 5 > 5')).to.equal('0');
									return fDone();
								}
							);
					}
				);
			suite
				(
					'Greater Than or Equal',
					function ()
					{
						test
							(
								'Basic greater than or equal comparisons.',
								(fDone) =>
								{
									let _Parser = getExpressionParser();
									Expect(_Parser.solve('Result = 5 >= 3')).to.equal('1');
									Expect(_Parser.solve('Result = 3 >= 5')).to.equal('0');
									Expect(_Parser.solve('Result = 5 >= 5')).to.equal('1');
									return fDone();
								}
							);
					}
				);
			suite
				(
					'Less Than',
					function ()
					{
						test
							(
								'Basic less than comparisons.',
								(fDone) =>
								{
									let _Parser = getExpressionParser();
									Expect(_Parser.solve('Result = 3 < 5')).to.equal('1');
									Expect(_Parser.solve('Result = 5 < 3')).to.equal('0');
									Expect(_Parser.solve('Result = 5 < 5')).to.equal('0');
									return fDone();
								}
							);
					}
				);
			suite
				(
					'Less Than or Equal',
					function ()
					{
						test
							(
								'Basic less than or equal comparisons.',
								(fDone) =>
								{
									let _Parser = getExpressionParser();
									Expect(_Parser.solve('Result = 3 <= 5')).to.equal('1');
									Expect(_Parser.solve('Result = 5 <= 3')).to.equal('0');
									Expect(_Parser.solve('Result = 5 <= 5')).to.equal('1');
									return fDone();
								}
							);
					}
				);
			suite
				(
					'Equal',
					function ()
					{
						test
							(
								'Basic equality comparisons.',
								(fDone) =>
								{
									let _Parser = getExpressionParser();
									Expect(_Parser.solve('Result = 5 == 5')).to.equal('1');
									Expect(_Parser.solve('Result = 5 == 3')).to.equal('0');
									return fDone();
								}
							);
					}
				);
			suite
				(
					'Not Equal',
					function ()
					{
						test
							(
								'Basic inequality comparisons.',
								(fDone) =>
								{
									let _Parser = getExpressionParser();
									Expect(_Parser.solve('Result = 5 != 3')).to.equal('1');
									Expect(_Parser.solve('Result = 5 != 5')).to.equal('0');
									return fDone();
								}
							);
					}
				);
			suite
				(
					'Comparison with Arithmetic',
					function ()
					{
						test
							(
								'Arithmetic is evaluated before comparison.',
								(fDone) =>
								{
									let _Parser = getExpressionParser();
									// 2 + 3 = 5, 1 + 2 = 3, so 5 > 3 = 1
									Expect(_Parser.solve('Result = 2 + 3 > 1 + 2')).to.equal('1');
									// 1 + 1 = 2, 3 + 1 = 4, so 2 > 4 = 0
									Expect(_Parser.solve('Result = 1 + 1 > 3 + 1')).to.equal('0');
									// 10 - 5 = 5, 2 * 3 = 6, so 5 < 6 = 1
									Expect(_Parser.solve('Result = 10 - 5 < 2 * 3')).to.equal('1');
									return fDone();
								}
							);
						test
							(
								'Comparison with variables.',
								(fDone) =>
								{
									let _Parser = getExpressionParser();
									let tmpData = { Height: 10, Width: 5 };
									let tmpDestination = {};
									_Parser.solve('Result = Height > Width', tmpData, {}, false, tmpDestination);
									Expect(tmpDestination.Result).to.equal('1');
									_Parser.solve('Result = Width > Height', tmpData, {}, false, tmpDestination);
									Expect(tmpDestination.Result).to.equal('0');
									_Parser.solve('Result = Height == Width', tmpData, {}, false, tmpDestination);
									Expect(tmpDestination.Result).to.equal('0');
									_Parser.solve('Result = Height != Width', tmpData, {}, false, tmpDestination);
									Expect(tmpDestination.Result).to.equal('1');
									return fDone();
								}
							);
					}
				);
		}
	);

suite
	(
		'Ternary Operator',
		function ()
		{
			suite
				(
					'Basic Ternary',
					function ()
					{
						test
							(
								'True branch is selected when condition is truthy.',
								(fDone) =>
								{
									let _Parser = getExpressionParser();
									Expect(_Parser.solve('Result = 5 > 3 ? 100 :: 200')).to.equal('100');
									return fDone();
								}
							);
						test
							(
								'False branch is selected when condition is falsy.',
								(fDone) =>
								{
									let _Parser = getExpressionParser();
									Expect(_Parser.solve('Result = 3 > 5 ? 100 :: 200')).to.equal('200');
									return fDone();
								}
							);
						test
							(
								'Ternary with equality comparison.',
								(fDone) =>
								{
									let _Parser = getExpressionParser();
									Expect(_Parser.solve('Result = 5 == 5 ? 10 :: 20')).to.equal('10');
									Expect(_Parser.solve('Result = 5 == 3 ? 10 :: 20')).to.equal('20');
									return fDone();
								}
							);
					}
				);
			suite
				(
					'Ternary with Variables',
					function ()
					{
						test
							(
								'Ternary selects based on variable comparison.',
								(fDone) =>
								{
									let _Parser = getExpressionParser();
									let tmpData = { Height: 10, Width: 5, A: 42, B: 99 };
									let tmpDestination = {};
									_Parser.solve('SomeValue = Height > Width ? A :: B', tmpData, {}, false, tmpDestination);
									Expect(tmpDestination.SomeValue).to.equal('42');
									_Parser.solve('SomeValue = Width > Height ? A :: B', tmpData, {}, false, tmpDestination);
									Expect(tmpDestination.SomeValue).to.equal('99');
									return fDone();
								}
							);
					}
				);
			suite
				(
					'Ternary with Arithmetic in Branches',
					function ()
					{
						test
							(
								'Arithmetic expressions work in ternary branches.',
								(fDone) =>
								{
									let _Parser = getExpressionParser();
									let tmpData = { A: 10, B: 5 };
									let tmpDestination = {};
									// A > B is true, so A + 1 = 11
									_Parser.solve('Result = A > B ? A + 1 :: B + 1', tmpData, {}, false, tmpDestination);
									Expect(tmpDestination.Result).to.equal('11');
									// B > A is false, so B + 1 = 6
									_Parser.solve('Result = B > A ? A + 1 :: B + 1', tmpData, {}, false, tmpDestination);
									Expect(tmpDestination.Result).to.equal('6');
									return fDone();
								}
							);
						test
							(
								'Arithmetic expressions work in the ternary condition.',
								(fDone) =>
								{
									let _Parser = getExpressionParser();
									// 2 + 3 = 5, 1 + 2 = 3, so 5 > 3 = true, result is 100
									Expect(_Parser.solve('Result = 2 + 3 > 1 + 2 ? 100 :: 200')).to.equal('100');
									// 1 + 1 = 2, 3 + 1 = 4, so 2 > 4 = false, result is 200
									Expect(_Parser.solve('Result = 1 + 1 > 3 + 1 ? 100 :: 200')).to.equal('200');
									return fDone();
								}
							);
					}
				);
			suite
				(
					'Nested Ternary',
					function ()
					{
						test
							(
								'Nested ternary with parenthesized inner ternary.',
								(fDone) =>
								{
									let _Parser = getExpressionParser();
									let tmpData = { A: 5, B: 3 };
									let tmpDestination = {};
									// A > 0 is true, then B > 0 is true, so result is 1
									_Parser.solve('Result = A > 0 ? (B > 0 ? 1 :: 2) :: 3', tmpData, {}, false, tmpDestination);
									Expect(tmpDestination.Result).to.equal('1');
									// A > 0 is true, then B > 10 is false, so result is 2
									_Parser.solve('Result = A > 0 ? (B > 10 ? 1 :: 2) :: 3', tmpData, {}, false, tmpDestination);
									Expect(tmpDestination.Result).to.equal('2');
									return fDone();
								}
							);
					}
				);
		}
	);

suite('ExpressionParser Numeric Validity Functions', function()
{
	test('ISNUMERIC distinguishes real numbers (including zero) from dirty values', function()
	{
		let testFable = new libFable();
		let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
		const fSolve = (pValue) => _Parser.solve('R = ISNUMERIC(Record.A)', { Record: { A: pValue } }, {}, testFable.manifest, {});
		Expect(fSolve('6.9')).to.equal('1');
		Expect(fSolve('0')).to.equal('1', 'a real zero reading is numeric');
		Expect(fSolve('-12.5')).to.equal('1');
		Expect(fSolve('')).to.equal('0');
		Expect(fSolve('   ')).to.equal('0');
		Expect(fSolve('Enter Dry and Wet Weights')).to.equal('0', 'placeholder text is not numeric');
		Expect(fSolve(null)).to.equal('0');
		Expect(fSolve(undefined)).to.equal('0');
	});

	test('TONUMBER coerces with an explicit fallback for dirty values', function()
	{
		let testFable = new libFable();
		let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
		const fSolve = (pValue, pFallback) => _Parser.solve(`R = TONUMBER(Record.A, ${pFallback})`, { Record: { A: pValue } }, {}, testFable.manifest, {});
		Expect(fSolve('6.9', 0)).to.equal('6.9');
		Expect(fSolve('0', 0)).to.equal('0');
		Expect(fSolve('', 0)).to.equal('0');
		Expect(fSolve('not a number', 0)).to.equal('0');
		Expect(fSolve('', -1)).to.equal('-1', 'the fallback is honored');
	});

	test('the functions compose into indicator expressions', function()
	{
		let testFable = new libFable();
		let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
		// "a real sample has an oven OR a meter reading" — the skip-row rule as an indicator column.
		const fSolve = (pO, pM) => _Parser.solve('R = (ISNUMERIC(Record.O) + ISNUMERIC(Record.M)) >= 1', { Record: { O: pO, M: pM } }, {}, testFable.manifest, {});
		Expect(fSolve('6.9', '')).to.equal('1');
		Expect(fSolve('', '3.1')).to.equal('1');
		Expect(fSolve('', 'Enter Dry and Wet Weights')).to.equal('0');
		Expect(_Parser.solve('R = ABS(TONUMBER(Record.D, 0))', { Record: { D: '-1.5' } }, {}, testFable.manifest, {})).to.equal('1.5');
	});

	test('isNumeric and toNumber are exposed directly on the Math service', function()
	{
		let testFable = new libFable();
		testFable.instantiateServiceProviderIfNotExists('Math');
		Expect(testFable.Math.isNumeric('42')).to.equal('1');
		Expect(testFable.Math.isNumeric('')).to.equal('0');
		Expect(testFable.Math.toNumber('x', 7)).to.equal('7');
		Expect(testFable.Math.toNumber(' 3.5 ')).to.equal('3.5');
	});

	test('TONUMBER preserves arbitrary precision — numeric strings flow VERBATIM', function()
	{
		let testFable = new libFable();
		testFable.instantiateServiceProviderIfNotExists('Math');
		// A float round-trip would collapse all of these.
		Expect(testFable.Math.toNumber('0.123456789012345678901234567890123'))
			.to.equal('0.123456789012345678901234567890123', 'long mantissa keeps every digit');
		Expect(testFable.Math.toNumber('900719925474099312345678901'))
			.to.equal('900719925474099312345678901', 'integers beyond 2^53 are untouched');
		Expect(testFable.Math.toNumber('1.500')).to.equal('1.500', 'trailing zeros are significant and kept');
		Expect(testFable.Math.toNumber('-0.000000000000000000001')).to.equal('-0.000000000000000000001');
		Expect(testFable.Math.toNumber('1e400')).to.equal('1e400', 'exponents beyond float range are still numeric');
	});

	test('ISNUMERIC classifies by decimal grammar, not float round-trip', function()
	{
		let testFable = new libFable();
		let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
		const fSolve = (pValue) => _Parser.solve('R = ISNUMERIC(Record.A)', { Record: { A: pValue } }, {}, testFable.manifest, {});
		Expect(fSolve('1e400')).to.equal('1', 'beyond float range but a valid precise number');
		Expect(fSolve('900719925474099312345678901')).to.equal('1');
		Expect(fSolve('1.5e-10')).to.equal('1');
		Expect(fSolve('+12.5')).to.equal('1');
		Expect(fSolve('.5')).to.equal('1');
		Expect(fSolve('1.2.3')).to.equal('0');
		Expect(fSolve('Infinity')).to.equal('0', 'not a decimal big.js can parse');
		Expect(fSolve('0x1F')).to.equal('0', 'hex is not in the precise-math grammar');
	});

	test('high-precision values survive a TONUMBER pass through the parser', function()
	{
		let testFable = new libFable();
		let _Parser = testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
		Expect(_Parser.solve('R = TONUMBER(Record.A, 0)', { Record: { A: '0.12345678901234567890123456789' } }, {}, testFable.manifest, {}))
			.to.equal('0.12345678901234567890123456789');
	});
});
