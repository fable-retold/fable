/**
* Unit tests for ExpressionParser operator precedence and operand binding
*
* Covers expressions whose operators span more than two precedence levels in
* one solve layer (including a function's argument list, where `,` is the
* loosest operator), unary + and - inside operator chains, and parenthesis
* groups that contain nothing but another group.
*
* @license     MIT
*/

var libFable = require('../source/Fable.js');

var Chai = require('chai');
var Expect = Chai.expect;

function getExpressionParser()
{
	let testFable = new libFable({ LogStreams: [ { level: 'fatal' } ] });
	return testFable.instantiateServiceProviderIfNotExists('ExpressionParser');
}

/**
 * Solve each `[ expression, expected ]` pair against a fresh copy of the data and check the assigned result.
 *
 * @param {Array<Array<string>>} pCases - Pairs of an expression (assigning to R) and the expected string result.
 * @param {Object} [pData] - Data the expression reads.
 */
function expectCases(pCases, pData)
{
	let tmpParser = getExpressionParser();
	for (let i = 0; i < pCases.length; i++)
	{
		let tmpData = Object.assign({ X: 3, Y: 4, Z: '' }, pData);
		tmpParser.solve(pCases[i][0], tmpData, {}, false, tmpData);
		Expect(tmpData.R, pCases[i][0]).to.equal(pCases[i][1]);
	}
}

suite
	(
		'ExpressionParser Operator Precedence',
		function ()
		{
			suite
				(
					'IF arguments that mix precedence levels',
					function ()
					{
						test
							(
								'An argument after the first whose first term is a product or quotient keeps the rest of the sum.',
								(fDone) =>
								{
									expectCases(
										[
											[ 'R = IF(X, ">", 0, X * Y + X, 0)', '15' ],
											[ 'R = IF(X, ">", 0, X * Y - X, 0)', '9' ],
											[ 'R = IF(X, ">", 0, X / Y + X, 0)', '3.75' ],
											[ 'R = IF(X, ">", 0, X * Y * 2 + X, 0)', '27' ],
											[ 'R = IF(X, ">", 0, X % 2 * Y + X, 0)', '7' ],
											[ 'R = IF(X, ">", 0, TONUMBER(X) * TONUMBER(Y) + TONUMBER(X) * TONUMBER(Y), 0)', '24' ]
										]);
									return fDone();
								}
							);
						test
							(
								'The else argument keeps the rest of the sum.',
								(fDone) =>
								{
									expectCases(
										[
											[ 'R = IF(X, "<", 0, 0, X * Y + X)', '15' ],
											[ 'R = IF(X, "<", 0, 0, X / Y - X)', '-2.25' ],
											[ 'R = IF(X, ">", 0, 0, X * Y + X)', '0' ]
										]);
									return fDone();
								}
							);
						test
							(
								'The right-hand comparison argument keeps the rest of the sum.',
								(fDone) =>
								{
									expectCases(
										[
											[ 'R = IF(15, "==", X * Y + X, 1, 0)', '1' ],
											[ 'R = IF(X, "<", X * Y - X, 1, 0)', '1' ]
										]);
									return fDone();
								}
							);
						test
							(
								'A first argument that sums bracketed products of function calls keeps the argument list intact.',
								(fDone) =>
								{
									expectCases(
										[
											[ 'R = IF(IF(X, ">", 0, 1, 0) * (1 - ISNUMERIC(Z)) + IF(X, ">", 0, 1, 0) * (1 - ISNUMERIC(Z)), "==", 2, 1, 0)', '1' ],
											[ 'R = IF(TONUMBER(X) * 2 + TONUMBER(Y) * 2, "==", 14, 1, 0)', '1' ]
										]);
									return fDone();
								}
							);
						test
							(
								'Shapes that were already correct stay correct.',
								(fDone) =>
								{
									expectCases(
										[
											[ 'R = X * Y + X', '15' ],
											[ 'R = IF(X, ">", 0, X + X * Y, 0)', '15' ],
											[ 'R = IF(X, ">", 0, (X * Y) + X, 0)', '15' ],
											[ 'R = IF(X, ">", 0, ROUND(X * Y + X, 4), 0)', '15' ],
											[ 'R = ROUND(X * Y + X, 4)', '15' ],
											[ 'R = IF(X * Y + X, ">", 14, 1, 0)', '1' ]
										]);
									return fDone();
								}
							);
						test
							(
								'Nested IF arguments with the same shape.',
								(fDone) =>
								{
									expectCases(
										[
											[ 'R = IF(X, ">", 0, IF(Y, ">", 0, X * Y + X, 0), 0)', '15' ],
											[ 'R = IF(X, ">", 0, IF(Y, ">", 0, X * Y + X, 0) * 2 + 1, 0)', '31' ],
											[ 'R = IF(X, "<", 0, 0, IF(Y, "<", 0, 0, X / Y + X))', '3.75' ]
										]);
									return fDone();
								}
							);
					}
				);
			suite
				(
					'Other conditional forms and functions',
					function ()
					{
						test
							(
								'WHEN branches keep the rest of the sum.',
								(fDone) =>
								{
									expectCases(
										[
											[ 'R = WHEN(X, X * Y + X, 0)', '15' ],
											[ 'R = WHEN(Z, 0, X / Y + X)', '3.75' ]
										]);
									return fDone();
								}
							);
						test
							(
								'TERNARY branches keep the rest of the sum.',
								(fDone) =>
								{
									expectCases(
										[
											[ 'R = TERNARY(X, X * Y + X, 0)', '15' ],
											[ 'R = TERNARY(0, 0, X * Y - X)', '9' ]
										]);
									return fDone();
								}
							);
						test
							(
								'The ? :: operator branches keep the rest of the sum.',
								(fDone) =>
								{
									expectCases(
										[
											[ 'R = X > 0 ? X * Y + X :: 0', '15' ],
											[ 'R = X < 0 ? 0 :: X * Y - X', '9' ]
										]);
									return fDone();
								}
							);
						test
							(
								'A later argument of another function keeps the rest of the sum.',
								(fDone) =>
								{
									expectCases(
										[
											[ 'R = ROUND(X / Y, 1 * 1 + 1)', '0.75' ],
											[ 'R = ROUND(X / Y, 1 ^ 2 * 1 + 1)', '0.75' ]
										]);
									return fDone();
								}
							);
					}
				);
			suite
				(
					'Operator chains outside functions',
					function ()
					{
						test
							(
								'Three precedence levels in one layer bind correctly.',
								(fDone) =>
								{
									expectCases(
										[
											[ 'R = 1 + 2 ^ 2 * 3', '13' ],
											[ 'R = 1 + 2 ^ 2 * 3 + 1', '14' ],
											[ 'R = 1 + 1 + 1 + 2 ^ 2 * 3 + 1', '16' ],
											[ 'R = 5 - 3 ^ 2 * 5', '-40' ],
											[ 'R = 1 + 2 * 3 ^ 2 * 2 + 1', '38' ],
											[ 'R = 1 + 2 * 3 - 4 / 2 + 2 ^ 3 * 2', '21' ],
											[ 'R = 2 > 2 ^ 2 - Y', '1' ],
											[ 'R = 2 + 3 - 3 * ABS((3 * 2))', '-13' ],
											[ 'R = 5 - ABS(5 * ((Y ^ 2)) * Y)', '-315' ]
										]);
									return fDone();
								}
							);
						test
							(
								'Two precedence levels, which were already correct, stay correct.',
								(fDone) =>
								{
									expectCases(
										[
											[ 'R = 1 + 2 * 3 + 1', '8' ],
											[ 'R = 2 ^ 2 * 3 + 1', '13' ],
											[ 'R = 7 - 2 - 1', '4' ],
											[ 'R = 1 + 12 / 4 ^ 2', '1.75' ],
											[ 'R = 10 % 4 * 2 + 1', '5' ]
										]);
									return fDone();
								}
							);
						test
							(
								'Unary minus inside a chain binds to the operand that follows it.',
								(fDone) =>
								{
									expectCases(
										[
											[ 'R = 1 + -1 * 5', '-4' ],
											[ 'R = 2 - -3 * 2', '8' ],
											[ 'R = 2 * -Y ^ 2 + 2', '34' ],
											[ 'R = X + -5 * 2 * 1', '-7' ],
											[ 'R = Y + -X - -Y', '5' ],
											[ 'R = -X * Y + X', '-9' ]
										]);
									return fDone();
								}
							);
						test
							(
								'Unary plus is a no-op wherever it appears.',
								(fDone) =>
								{
									expectCases(
										[
											[ 'R = 2 * +3', '6' ],
											[ 'R = +3', '3' ],
											[ 'R = (+3)', '3' ],
											[ 'R = 1 + +X * 2', '7' ]
										]);
									return fDone();
								}
							);
						test
							(
								'Chained unary minus applies each sign in turn.',
								(fDone) =>
								{
									expectCases(
										[
											[ 'R = - -3', '3' ],
											[ 'R = - - X', '3' ],
											[ 'R = 2 * - -X', '6' ],
											[ 'R = 1 - - -X', '-2' ],
											[ 'R = -(-X)', '3' ]
										]);
									return fDone();
								}
							);
						test
							(
								'A parenthesis group that holds only another group passes its value through.',
								(fDone) =>
								{
									expectCases(
										[
											[ 'R = ((Y)) ^ 2', '16' ],
											[ 'R = (((X + 1))) * 2', '8' ],
											[ 'R = 1 + ((X * Y)) * 2', '25' ],
											[ 'R = ((Y))', '4' ],
											[ 'R = ((X * Y + X))', '15' ]
										]);
									return fDone();
								}
							);
						test
							(
								'Existing conventions: every binary operator is left-associative and unary minus binds tighter than ^.',
								(fDone) =>
								{
									expectCases(
										[
											[ 'R = 2 ^ 3 ^ 2', '64' ],
											[ 'R = -2 ^ 2', '4' ],
											[ 'R = 1 < 2 < 3', '1' ]
										]);
									return fDone();
								}
							);
						test
							(
								'The solve list for a simple parenthesized expression does not gain steps.',
								(fDone) =>
								{
									let tmpParser = getExpressionParser();
									Expect(tmpParser.buildPostfixedSolveList(tmpParser.tokenize('Value = (-5 + 3)')).length).to.equal(3);
									Expect(tmpParser.buildPostfixedSolveList(tmpParser.tokenize('Value = (5)')).length).to.equal(2);
									return fDone();
								}
							);
					}
				);
			suite
				(
					'Randomised comparison against a reference evaluator',
					function ()
					{
						// Deterministic (mulberry32) so a failure reproduces; the seed and the expression are in the message.
						const createRandom = (pSeed) =>
						{
							let tmpState = pSeed;
							return () =>
							{
								tmpState = (tmpState + 0x6D2B79F5) | 0;
								let tmpValue = Math.imul(tmpState ^ (tmpState >>> 15), 1 | tmpState);
								tmpValue = (tmpValue + Math.imul(tmpValue ^ (tmpValue >>> 7), 61 | tmpValue)) ^ tmpValue;
								return ((tmpValue ^ (tmpValue >>> 14)) >>> 0) / 4294967296;
							};
						};

						const REFERENCE_PRECEDENCE = { '^': 2, '*': 3, '/': 3, '%': 3, '+': 4, '-': 4, '<': 5, '>': 5, '<=': 5, '>=': 5, '==': 5, '!=': 5 };
						const REFERENCE_DATA = { X: 3, Y: 4, W: 2 };

						const generateExpression = (fRandom, pDepth) =>
						{
							const fPick = (pList) =>
							{
								return pList[Math.floor(fRandom() * pList.length)];
							};
							const fOperand = (pOperandDepth) =>
							{
								let tmpSign = (fRandom() < 0.12) ? '-' : '';
								let tmpChoice = fRandom();
								if ((pOperandDepth > 2) || (tmpChoice < 0.6))
								{
									return tmpSign + fPick([ '1', '2', '3', '5', 'X', 'Y', 'W' ]);
								}
								if (tmpChoice < 0.7)
								{
									return `${tmpSign}(${generateExpression(fRandom, pOperandDepth + 1)})`;
								}
								if (tmpChoice < 0.8)
								{
									return `${tmpSign}ABS(${generateExpression(fRandom, pOperandDepth + 1)})`;
								}
								let tmpArguments = [ 0, 0, 0, 0 ].map(() => generateExpression(fRandom, pOperandDepth + 1));
								return `${tmpSign}IF(${tmpArguments[0]}, "${fPick([ '<', '>', '==', '>=' ])}", ${tmpArguments[1]}, ${tmpArguments[2]}, ${tmpArguments[3]})`;
							};
							let tmpExpression = fOperand(pDepth);
							let tmpOperatorCount = Math.floor(fRandom() * ((pDepth > 1) ? 2 : 4));
							for (let i = 0; i < tmpOperatorCount; i++)
							{
								let tmpOperator = fPick([ '+', '-', '*', '*', '+', '^', '/', '%', '<', '>', '==', '>=', '<=', '!=' ]);
								let tmpRight;
								if (tmpOperator === '^')
								{
									tmpRight = fPick([ '1', '2', 'W' ]);
								}
								else if ((tmpOperator === '/') || (tmpOperator === '%'))
								{
									tmpRight = fPick([ '2', '4', '5', 'Y' ]);
								}
								else
								{
									tmpRight = fOperand(pDepth);
								}
								tmpExpression += ` ${tmpOperator} ${tmpRight}`;
							}
							return tmpExpression;
						};

						// Precedence climbing over the same grammar; every binary operator is left-associative.
						const evaluateReference = (pExpression) =>
						{
							let tmpTokens = pExpression.match(/"[^"]*"|==|>=|<=|!=|[A-Za-z]+|\d+(\.\d+)?|[-+*^<>(),/%]/g);
							let tmpIndex = 0;
							const fApply = (pOperator, pLeft, pRight) =>
							{
								switch (pOperator)
								{
									case '+': return pLeft + pRight;
									case '-': return pLeft - pRight;
									case '*': return pLeft * pRight;
									case '/': return pLeft / pRight;
									case '%': return pLeft % pRight;
									case '^': return Math.pow(pLeft, pRight);
									case '<': return (pLeft < pRight) ? 1 : 0;
									case '>': return (pLeft > pRight) ? 1 : 0;
									case '<=': return (pLeft <= pRight) ? 1 : 0;
									case '>=': return (pLeft >= pRight) ? 1 : 0;
									case '==': return (Math.abs(pLeft - pRight) <= 0.000001) ? 1 : 0;
									case '!=': return (Math.abs(pLeft - pRight) > 0.000001) ? 1 : 0;
								}
							};
							let fExpression;
							const fOperand = () =>
							{
								if (tmpTokens[tmpIndex] === '-')
								{
									tmpIndex++;
									return -fOperand();
								}
								if (tmpTokens[tmpIndex] === '(')
								{
									tmpIndex++;
									let tmpValue = fExpression(Infinity);
									tmpIndex++;
									return tmpValue;
								}
								if (tmpTokens[tmpIndex + 1] === '(')
								{
									let tmpFunction = tmpTokens[tmpIndex];
									tmpIndex += 2;
									let tmpArguments = [];
									while (tmpTokens[tmpIndex] !== ')')
									{
										if (tmpTokens[tmpIndex] === ',')
										{
											tmpIndex++;
										}
										else if (tmpTokens[tmpIndex][0] === '"')
										{
											tmpArguments.push(tmpTokens[tmpIndex].slice(1, -1));
											tmpIndex++;
										}
										else
										{
											tmpArguments.push(fExpression(5));
										}
									}
									tmpIndex++;
									if (tmpFunction === 'ABS')
									{
										return Math.abs(tmpArguments[0]);
									}
									return fApply(tmpArguments[1], tmpArguments[0], tmpArguments[2]) ? tmpArguments[3] : tmpArguments[4];
								}
								let tmpToken = tmpTokens[tmpIndex];
								tmpIndex++;
								return (tmpToken in REFERENCE_DATA) ? REFERENCE_DATA[tmpToken] : Number(tmpToken);
							};
							fExpression = (pMaxPrecedence) =>
							{
								let tmpLeft = fOperand();
								while ((tmpIndex < tmpTokens.length) && (tmpTokens[tmpIndex] in REFERENCE_PRECEDENCE) && (REFERENCE_PRECEDENCE[tmpTokens[tmpIndex]] <= pMaxPrecedence))
								{
									let tmpOperator = tmpTokens[tmpIndex];
									tmpIndex++;
									tmpLeft = fApply(tmpOperator, tmpLeft, fExpression(REFERENCE_PRECEDENCE[tmpOperator] - 1));
								}
								return tmpLeft;
							};
							return fExpression(Infinity);
						};

						test
							(
								'The reference evaluator agrees with hand-checked values.',
								(fDone) =>
								{
									Expect(evaluateReference('1 + 2 ^ 2 * 3')).to.equal(13);
									Expect(evaluateReference('2 ^ 3 ^ 2')).to.equal(64);
									Expect(evaluateReference('-2 ^ 2')).to.equal(4);
									Expect(evaluateReference('IF(X, ">", 0, X * Y + X, 0)')).to.equal(15);
									return fDone();
								}
							);
						test
							(
								'1500 generated expressions solve to the reference value.',
								(fDone) =>
								{
									const SEED = 20261124;
									let fRandom = createRandom(SEED);
									let tmpParser = getExpressionParser();
									let tmpChecked = 0;
									while (tmpChecked < 1500)
									{
										let tmpExpression = generateExpression(fRandom, 0);
										let tmpExpected = evaluateReference(tmpExpression);
										if (!Number.isFinite(tmpExpected) || (Math.abs(tmpExpected) > 1e12))
										{
											continue;
										}
										let tmpData = Object.assign({}, REFERENCE_DATA);
										tmpParser.solve(`R = ${tmpExpression}`, tmpData, {}, false, tmpData);
										Expect(Number(tmpData.R), `seed ${SEED}: ${tmpExpression}`).to.be.closeTo(tmpExpected, 0.000001 * Math.max(1, Math.abs(tmpExpected)));
										tmpChecked++;
									}
									return fDone();
								}
							);
					}
				);
		}
	);
