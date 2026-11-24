const libExpressionParserOperationBase = require('./Fable-Service-ExpressionParser-Base.js');

class ExpressionParserPostfix extends libExpressionParserOperationBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
		this.serviceType = 'ExpressionParser-Postfix';
	}

	getPosfixSolveListOperation(pOperation, pLeftValue, pRightValue, pDepthSolveList, pDepthSolveIndex)
	{
		let tmpOperation = ({
			VirtualSymbolName: pOperation.VirtualSymbolName,
			Operation: pOperation,
			LeftValue: pLeftValue,
			RightValue: pRightValue
		});

		let tmpDepthSolveList = Array.isArray(pDepthSolveList) ? pDepthSolveList : false;

		/* These two if blocks are very complex -- they basically provide a
		 * way to deal with recursion that can be expressed to the user in
		 * a meaningful way.
		 * 
		 * The reason we are doing it as such is to show exactly how the
		 * solver resolves the passed-in tokens into a solvable expression.
		 */
		// An operand bound to another operation's result (see resolveSolveLayerOperands) reads that virtual symbol.
		if ('LeftVirtualSymbolName' in tmpOperation.Operation)
		{
			tmpOperation.LeftValue = this.getTokenContainerObject(tmpOperation.Operation.LeftVirtualSymbolName, 'Token.VirtualSymbol');
		}
		else if (!tmpOperation.LeftValue.VirtualSymbolName)
		{
			tmpOperation.LeftValue.VirtualSymbolName = tmpOperation.VirtualSymbolName;
		}
		else
		{
			// We need to set the left value to a virtual symbol instead of the looked up value if it's already used in another operation
			tmpOperation.LeftValue = this.getTokenContainerObject(tmpOperation.LeftValue.VirtualSymbolName, 'Token.VirtualSymbol');
		}
		if ('RightVirtualSymbolName' in tmpOperation.Operation)
		{
			tmpOperation.RightValue = this.getTokenContainerObject(tmpOperation.Operation.RightVirtualSymbolName, 'Token.VirtualSymbol');
		}
		else if (!tmpOperation.RightValue.VirtualSymbolName)
		{
			tmpOperation.RightValue.VirtualSymbolName = tmpOperation.VirtualSymbolName;
		}
		else
		{
			// We need to set the right value to a virtual symbol instead of the looked up value if it's already used in another operation
			tmpOperation.RightValue = this.getTokenContainerObject(tmpOperation.RightValue.VirtualSymbolName, 'Token.VirtualSymbol');
		}

		tmpOperation.Operation.Parsed = true;

		return tmpOperation;
	}

	/**
	 * Parse one solve layer with precedence climbing and bind each binary operator to its operands.
	 *
	 * Within a layer, a parenthesis group is a `(` `)` pair (its contents live in a deeper layer) and a
	 * function call is a function token followed by such a pair.  Operators bind left-associatively, and
	 * a lower Precedence number binds tighter.  Unary + and - (Precedence 1 by this point) bind to the
	 * operand that follows them.
	 *
	 * Each binary operator gets either `<Side>VirtualSymbolName` (the operand is another binary
	 * operation's result) or `<Side>OperandToken` (the token that stands for the operand).  When the
	 * layer does not parse, every binding is removed and the solve list falls back to adjacent tokens.
	 *
	 * @param {Array<Object>} pSolveLayerTokens - The token objects in one solve layer, in expression order.
	 * @return {{ Token: Object, IsOperation: boolean, IsBinary?: boolean } | false} - The operand the whole layer reduces to, or false.
	 */
	resolveSolveLayerOperands(pSolveLayerTokens)
	{
		let tmpIndex = 0;

		const fIsOperator = (pToken) =>
		{
			return pToken && (pToken.Type === 'Token.Operator');
		};
		const fIsUnaryOperator = (pToken) =>
		{
			return fIsOperator(pToken) && (pToken.Descriptor.Precedence === 1) && ((pToken.Token === '-') || (pToken.Token === '+'));
		};
		const fIsParenthesis = (pToken, pParenthesis) =>
		{
			return pToken && (pToken.Type === 'Token.Parenthesis') && (pToken.Token === pParenthesis);
		};

		const fParseOperand = () =>
		{
			let tmpToken = pSolveLayerTokens[tmpIndex];
			if (!tmpToken)
			{
				return false;
			}
			if (fIsUnaryOperator(tmpToken))
			{
				tmpIndex++;
				let tmpOperand = fParseOperand();
				if (!tmpOperand)
				{
					return false;
				}
				// A unary + is dropped from the solve list, so it stands for its operand.
				if (tmpToken.Token === '+')
				{
					return tmpOperand;
				}
				return { Token: tmpToken, IsOperation: true };
			}
			if (tmpToken.Type === 'Token.Function')
			{
				if (!fIsParenthesis(pSolveLayerTokens[tmpIndex + 1], '(') || !fIsParenthesis(pSolveLayerTokens[tmpIndex + 2], ')'))
				{
					return false;
				}
				tmpIndex += 3;
				return { Token: tmpToken, IsOperation: true };
			}
			if (fIsParenthesis(tmpToken, '('))
			{
				if (!fIsParenthesis(pSolveLayerTokens[tmpIndex + 1], ')'))
				{
					return false;
				}
				tmpIndex += 2;
				return { Token: tmpToken, IsOperation: false };
			}
			if (fIsOperator(tmpToken) || (tmpToken.Type === 'Token.Parenthesis'))
			{
				return false;
			}
			tmpIndex++;
			return { Token: tmpToken, IsOperation: false };
		};

		const fBindOperand = (pOperator, pSide, pOperand) =>
		{
			if (pOperand.IsBinary)
			{
				pOperator[`${pSide}VirtualSymbolName`] = pOperand.Token.VirtualSymbolName;
			}
			else
			{
				pOperator[`${pSide}OperandToken`] = pOperand.Token;
			}
		};

		const fParseExpression = (pMaxPrecedence) =>
		{
			let tmpLeft = fParseOperand();
			if (!tmpLeft)
			{
				return false;
			}
			while ((tmpIndex < pSolveLayerTokens.length) && fIsOperator(pSolveLayerTokens[tmpIndex]) && !fIsUnaryOperator(pSolveLayerTokens[tmpIndex]) &&
				(pSolveLayerTokens[tmpIndex].Descriptor.Precedence <= pMaxPrecedence))
			{
				let tmpOperator = pSolveLayerTokens[tmpIndex];
				tmpIndex++;
				let tmpRight = fParseExpression(tmpOperator.Descriptor.Precedence - 1);
				if (!tmpRight)
				{
					return false;
				}
				fBindOperand(tmpOperator, 'Left', tmpLeft);
				fBindOperand(tmpOperator, 'Right', tmpRight);
				tmpLeft = { Token: tmpOperator, IsOperation: true, IsBinary: true };
			}
			return tmpLeft;
		};

		let tmpRoot = fParseExpression(Infinity);
		if (!tmpRoot || (tmpIndex < pSolveLayerTokens.length))
		{
			for (let i = 0; i < pSolveLayerTokens.length; i++)
			{
				delete pSolveLayerTokens[i].LeftVirtualSymbolName;
				delete pSolveLayerTokens[i].RightVirtualSymbolName;
				delete pSolveLayerTokens[i].LeftOperandToken;
				delete pSolveLayerTokens[i].RightOperandToken;
			}
			return false;
		}
		return tmpRoot;
	}

	buildPostfixedSolveList(pTokenizedExpression, pResultObject)
	{
		let tmpResults = (typeof(pResultObject) === 'object') ? pResultObject : { ExpressionParserLog: [] };

		tmpResults.PostfixedAssignmentAddress = 'Result'
		tmpResults.PostfixedAssignmentOperator = this.ExpressionParser.tokenMap['=']; // This is the default assignment operator
		tmpResults.PostfixTokenObjects = [];
		tmpResults.PostfixSolveList = [];

		if (pTokenizedExpression.length < 3)
		{
			tmpResults.ExpressionParserLog.push(`ERROR: ExpressionParser.buildPostfixedSolveList was passed a tokenized expression with less than three tokens.`);
			this.log.error(tmpResults.ExpressionParserLog[tmpResults.ExpressionParserLog.length-1]);
			return tmpResults.PostfixTokenObjects;
		}

		// 1. Figure out the Equality Assignment
		let tmpEqualsIndex = -1;
		for (let i = 0; i < pTokenizedExpression.length; i++)
		{
			if ((this.ExpressionParser.tokenMap[pTokenizedExpression[i]]) && (this.ExpressionParser.tokenMap[pTokenizedExpression[i]].Type === 'Assignment'))
			{
				if (tmpEqualsIndex < 0)
				{
					tmpEqualsIndex = i;
					tmpResults.PostfixedAssignmentOperator = this.ExpressionParser.tokenMap[pTokenizedExpression[i]];
				}
				else
				{
					tmpResults.ExpressionParserLog.push(`ERROR: ExpressionParser.buildPostfixedSolveList found multiple assignment operators in the tokenized expression; assignment operator '${pTokenizedExpression[i]}' #${tmpEqualsIndex} at token index ${i}.`);
					this.log.error(tmpResults.ExpressionParserLog[tmpResults.ExpressionParserLog.length-1]);
					return tmpResults.PostfixTokenObjects;
				}
			}
		}

		if (tmpEqualsIndex == -1)
		{
			tmpResults.ExpressionParserLog.push(`WARNING: ExpressionParser.buildPostfixedSolveList found no equality assignment in the tokenized expression; defaulting to Result`);
			//this.log.warn(tmpResults.ExpressionParserLog[tmpResults.ExpressionParserLog.length-1]);
		}
		else if (tmpEqualsIndex > 1)
		{
			tmpResults.ExpressionParserLog.push(`WARNING: ExpressionParser.buildPostfixedSolveList found an equality assignment in the tokenized expression at an unexpected location (token index ${tmpEqualsIndex}); the expression cannot be parsed.`);
			this.log.warn(tmpResults.ExpressionParserLog[tmpResults.ExpressionParserLog.length-1]);
		}
		else if (tmpEqualsIndex === 0)
		{
			// This is an implicit function -- just go to result and return the value.
			// That is... the user entered something like "= 5 + 3" so we should just return 8, and use the default Result quietly.
		}
		else
		{
			tmpResults.PostfixedAssignmentAddress = pTokenizedExpression[0];
		}

		// 2. Categorize tokens in the expression, put them in the "expression list" as a token object
		for (let i = tmpEqualsIndex + 1; i < pTokenizedExpression.length; i++)
		{
			tmpResults.PostfixTokenObjects.push(this.getTokenContainerObject(pTokenizedExpression[i]));
		}

		// 3. Decorate mathematical parsing depth and detect functions at the same time
		//    Having written this a few times now, it's easier to detect functions *while* parsing depth.
		//    Especially if we want our system to be able to communicate with the user when there is an issue.
		let tmpDepth = 0;
		// The virtual symbol index is used for the abstract interim values that are generated at each step of the solve
		let tmpVirtualParenthesisIndex = 0;
		let tmpSolveLayerStack = [];
		// Kick off the solve layer stack with the first solve set identifier
		const tmpRootSolveLayer = `SolveSet_${tmpVirtualParenthesisIndex}_D_${tmpDepth}`;
		tmpSolveLayerStack.push(tmpRootSolveLayer);
		for (let i = 0; i < tmpResults.PostfixTokenObjects.length; i++)
		{
			// 1. If it's an open parenthesis, set the parenthesis at the current depth and increment the depth
			if (tmpResults.PostfixTokenObjects[i].Token === '(')
			{
				// Set the depth of the open parenthesis to the current solution depth
				tmpResults.PostfixTokenObjects[i].Depth = tmpDepth;
				// Generate the virtual symbol name for user output
				tmpResults.PostfixTokenObjects[i].VirtualSymbolName = `Pr_${tmpVirtualParenthesisIndex}_D_${tmpDepth}`;

				// 1a. Detect if this parenthesis is signaling a function
				//     If the previous token is a Symbol (e.g. it say sin(x) or sqrt(3+5) or something) then the parser will interpret it as a function
				if (i > 0)
				{
					if (tmpResults.PostfixTokenObjects[i-1].Type === 'Token.Symbol')
					{
						// Set the type of this to be a function
						tmpResults.PostfixTokenObjects[i-1].Type = 'Token.Function';
					}
				}

				// Parenthesis manage the solve layer stack
				// For adding a new parenthesis solve layer, we put the parenthesis in the stack we are in and then make all the contained tokens be within the stack of the parenthesis
				tmpResults.PostfixTokenObjects[i].SolveLayerStack = tmpSolveLayerStack[tmpSolveLayerStack.length-1];
				tmpSolveLayerStack.push(tmpResults.PostfixTokenObjects[i].VirtualSymbolName);

				tmpVirtualParenthesisIndex++;
				tmpDepth++;
			}

			// 2. If it's a closed parenthesis, decrease the depth
			else if (tmpResults.PostfixTokenObjects[i].Token === ')')
			{
				tmpDepth--;

				tmpResults.PostfixTokenObjects[i].Depth = tmpDepth;

				// Check to see that the depth of the closed parenthesis is greater than 0
				if (tmpDepth < 0)
				{
					tmpResults.ExpressionParserLog.push(`ERROR: ExpressionParser.buildPostfixedSolveList found a closing parenthesis at token index ${i} with no corresponding opening parenthesis.`);
					this.log.error(tmpResults.ExpressionParserLog[tmpResults.ExpressionParserLog.length-1]);
				}

				// Parenthesis manage the solve layer stack
				// For closing parenthesis solve layer with a close paren, we put it in the same stack as the opening parenthesis.
				// Give the closing parenthesis the same virtual symbol name as the opening parenthesis
				// (do the both above at the same time)
				tmpResults.PostfixTokenObjects[i].VirtualSymbolName = tmpSolveLayerStack.pop();
				tmpResults.PostfixTokenObjects[i].SolveLayerStack = tmpSolveLayerStack[tmpSolveLayerStack.length-1];
			}
			else
			{
				tmpResults.PostfixTokenObjects[i].Depth = tmpDepth;
				tmpResults.PostfixTokenObjects[i].SolveLayerStack = tmpSolveLayerStack[tmpSolveLayerStack.length-1];
			}
		}

		// 4. Walk through the decorated symbols and generate the postfix solve list
		//    We are going to start by creating a map of the solve layers:
		let tmpSolveLayerMap = {};
		let tmpSolveLayerMaxDepth = 0;
		for (let i = 0; i < tmpResults.PostfixTokenObjects.length; i++)
		{
			if (!(tmpResults.PostfixTokenObjects[i].SolveLayerStack in tmpSolveLayerMap))
			{
				tmpSolveLayerMap[tmpResults.PostfixTokenObjects[i].SolveLayerStack] = [];
			}
			tmpSolveLayerMap[tmpResults.PostfixTokenObjects[i].SolveLayerStack].push(tmpResults.PostfixTokenObjects[i]);

			// See what our max depth is.  This is super important to the postfix operation
			// The programmer in me thinks it would be funny to not track this and just use the map key length as the max size, which would work (logically impossible to have a depth > key length) but it would be quite a bit more confusing to grok the algorithm.
			if (tmpResults.PostfixTokenObjects[i].Depth > tmpSolveLayerMaxDepth)
			{
				tmpSolveLayerMaxDepth = tmpResults.PostfixTokenObjects[i].Depth;
			}
		}

		let tmpSolveLayerKeys = Object.keys(tmpSolveLayerMap);
		// Reset the virtual symbol index -- it was used above for uniquenes when creating abstract symbols for parenthesis and layer stacks.
		let tmpVirtualSymbolIndex = 0;
		tmpSolveLayerKeys.sort(
			// Sort the solve layers by depth.
			(pLeftLayer, pRightLayer)=>
			{
				// It is impossible to have a layer with no entries in it.  
				// If that ever happens, the bug is actually above and we actively want this to blow up.
				if (tmpSolveLayerMap[pLeftLayer][0].Depth < tmpSolveLayerMap[pRightLayer][0].Depth)
				{
					return 1;
				}
				if (tmpSolveLayerMap[pLeftLayer][0].Depth > tmpSolveLayerMap[pRightLayer][0].Depth)
				{
					return -1;
				}
				return 0;
			});

		// 5. Generate the postfix solve list
		//    The most important thing is going backwards in the depth order (a la reverse polish).
		//    Specifically not using shunting yard to provide in-depth "show your work" notes
		//    Yes it is possible to do a somewhat similar thing with shunting yard but the code is almost unreadable

		// 5.1 Build the Virtual Symbol Names
		// This maps layer stack addresses (which match parenthesis virtual symbol names) to the resultant value for that layer stack.
		// These values change as it solves but the last assignment is the proper assignment because math only reads forward in a line
		tmpResults.PostfixLayerstackMap = {};
		//FIXME: vet these - do we need a suffix version?
		const unaryEligibleOperationTokens = [ '+', '-' ];
		const unaryOperationPrefixTriggerTypes = [ 'Token.Operator', 'Token.Assignment' ];
		for (let tmpSolveLayerIndex = 0; tmpSolveLayerIndex < tmpSolveLayerKeys.length; tmpSolveLayerIndex++)
		{
			let tmpSolveLayerTokens = tmpSolveLayerMap[tmpSolveLayerKeys[tmpSolveLayerIndex]];
			// For each precedence (this isn't strictly required here but makes the outcome for the user more readable)
			for (let tmpPrecedence = 0; tmpPrecedence <= this.ExpressionParser.tokenMaxPrecedence; tmpPrecedence++)
			{
				// Enumerate all tokens in a layer's expression.
				// There is a recursive way to do this, but given the short length of even the most complex equations we're favoring readability.
				for (let i = 0; i < tmpSolveLayerTokens.length; i++)
				{
					const tmpToken = tmpSolveLayerTokens[i];
					if (unaryEligibleOperationTokens.includes(tmpToken.Token) &&
					// promote to unary if:
					// 1. we are the first token in our group
					// 2. we are prefixed by a token type that is incompatible with us being binary
						(i == 0 || unaryOperationPrefixTriggerTypes.includes(tmpSolveLayerTokens[i - 1].Type)))
					{
						//FIXME: slow, but don't break the static data
						tmpToken.Descriptor = JSON.parse(JSON.stringify(tmpToken.Descriptor));
						tmpToken.Descriptor.Precedence = 1;
					}
					//FIXME: handle operators with dynamic precedence (ex. unary vs. bunary + and -)
					// If the token is an operator and at the current precedence, add it to the postfix solve list and mutate the array.
					if ((tmpSolveLayerTokens[i].Type === 'Token.Operator') &&
						(tmpToken.Descriptor.Precedence === tmpPrecedence))
					{
						// If there is a token and nothing else in this layer, then it's an error.
						if (tmpSolveLayerTokens.length === 1)
						{
							tmpResults.ExpressionParserLog.push(`ERROR: ExpressionParser.buildPostfixedSolveList found a single operator in a solve layer expression at token index ${i}`);
							this.log.error(tmpResults.ExpressionParserLog[tmpResults.ExpressionParserLog.length-1]);
							return tmpResults.PostfixSolveList;
						}
						// The - at the beginning of an expression is a number line orientation modifier
						else if ((i == 0) && (tmpToken.Token == '-' || tmpToken.Token == '+'))
						{
							tmpToken.VirtualSymbolName = `VNLO_${tmpVirtualSymbolIndex}`;
							tmpResults.PostfixLayerstackMap[tmpToken.SolveLayerStack] = tmpToken.VirtualSymbolName;
							tmpVirtualSymbolIndex++;
						}
						// If the token is at the beginning of the expression and not a number line orientation modifier, it's an error.
						else if ((i == 0) && ((tmpToken.Token != '+') || (tmpToken.Token != '-')))
						{
							tmpResults.ExpressionParserLog.push(`ERROR: ExpressionParser.buildPostfixedSolveList found an operator at the beginning of a solve layer expression at token index ${i}`);
							this.log.error(tmpResults.ExpressionParserLog[tmpResults.ExpressionParserLog.length-1]);
							return tmpResults.PostfixSolveList;
						}
						// If the token is at the end of the expression, it is an error.
						else if (i == tmpSolveLayerTokens.length - 1)
						{
							tmpResults.ExpressionParserLog.push(`ERROR: ExpressionParser.buildPostfixedSolveList found an operator at the end of a solve layer expression at token index ${i}`);
							this.log.error(tmpResults.ExpressionParserLog[tmpResults.ExpressionParserLog.length-1]);
							return tmpResults.PostfixSolveList;
						}

						// The - after an operator or an open parenthesis is also a number line orientation modifier
						else if ((i > 0) && (tmpToken.Token == '-') && ((tmpSolveLayerTokens[i-1].Type === 'Token.Operator') || (tmpSolveLayerTokens[i-1].Token === '(')))
						{
							// The number line negation operator is a special case that generates a virtual constant (-1.0) and multiplies it by the next token
							tmpToken.VirtualSymbolName = `VNLO_${tmpVirtualSymbolIndex}`;
							tmpVirtualSymbolIndex++;
						}
						// The + at the beginning is also a number line orientation modifier ... THAT WE IGNORE
						else if ((i == 0) && (tmpToken.Token == '+'))
						{
							continue;
						}
						// The + after an operator or a parenthesis is also a number line orientation modifier ... THAT WE IGNORE
						else if ((i > 0) && (tmpToken.Token == '+') && ((tmpSolveLayerTokens[i-1].Type === 'Token.Operator') || (tmpSolveLayerTokens[i-1].Token === '(')))
						{
							continue;
						}

						// If the token is next to another operator it's a parsing error
						else if (((tmpSolveLayerTokens[i-1].Type === 'Token.Operator') || (tmpSolveLayerTokens[i+1].Type === 'Token.Operator')) &&
								(tmpSolveLayerTokens[i+1].Token != '-' && tmpSolveLayerTokens[i+1].Token != '+'))
						{
							tmpResults.ExpressionParserLog.push(`ERROR: ExpressionParser.buildPostfixedSolveList found an operator at token index ${i} that is not surrounded by two values.`);
							this.log.error(tmpResults.ExpressionParserLog[tmpResults.ExpressionParserLog.length-1]);
							return tmpResults.PostfixSolveList;
						}

						// Finally add a virtual symbol name to the dang thing.
						else
						{
							tmpToken.VirtualSymbolName = `V_${tmpVirtualSymbolIndex}`;
							tmpResults.PostfixLayerstackMap[tmpToken.SolveLayerStack] = tmpToken.VirtualSymbolName;
							tmpVirtualSymbolIndex++;
						}
					}
					else if ((tmpSolveLayerTokens[i].Type === 'Token.Function') && (tmpPrecedence === 0))
					{
						let tmpToken = tmpSolveLayerTokens[i];
						tmpToken.VirtualSymbolName = `VFE_${tmpVirtualSymbolIndex}`;
						tmpVirtualSymbolIndex++;
						tmpResults.PostfixLayerstackMap[tmpToken.SolveLayerStack] = tmpToken.VirtualSymbolName;
					}
				}
			}
		}

		// 5.15 Generate Virtual Symbol Clusters for Functions and Parenthesis
		//      ... this gets funny because of precedence of operations surrounding them, parenthesis and functions.
		let tmpFunctionCacheLIFOStack = [];
		for (let i = 0; i < tmpResults.PostfixTokenObjects.length; i++)
		{
			let tmpPostfixTokenObject = tmpResults.PostfixTokenObjects[i];

			if (tmpPostfixTokenObject.Type === 'Token.Parenthesis')
			{
				// This is just to track the parenthesis stack level for User feedback
				tmpPostfixTokenObject.ParenthesisStack = tmpPostfixTokenObject.VirtualSymbolName;

				// At the beginning of the  expression, this must be an open parenthesis to be legal.
				if (i == 0)
				{
					tmpPostfixTokenObject.IsFunction = false;
					let tmpVirtualSymbolName = tmpResults.PostfixLayerstackMap[tmpPostfixTokenObject.VirtualSymbolName];
					if (!tmpVirtualSymbolName)
					{
						// ... this parenthesis group has no operators in it; make a virtual symbol name.
						tmpVirtualSymbolName = `VP_${tmpVirtualSymbolIndex}`;
						tmpVirtualSymbolIndex++;
					}
					tmpPostfixTokenObject.VirtualSymbolName = tmpVirtualSymbolName;
					tmpFunctionCacheLIFOStack.push(tmpPostfixTokenObject);
				}
				// If it's an open parenthesis
				else if (tmpPostfixTokenObject.Token === '(')
				{
					// ... supporting a function
					if (tmpResults.PostfixTokenObjects[i-1].Type === 'Token.Function')
					{
						tmpPostfixTokenObject.IsFunction = true;
						tmpPostfixTokenObject.Function = tmpResults.PostfixTokenObjects[i-1];
						let tmpVirtualSymbolName = tmpResults.PostfixLayerstackMap[tmpPostfixTokenObject.VirtualSymbolName];
						if (!tmpVirtualSymbolName)
						{
							// ... this parenthesis group has no operators in it; make a virtual symbol name.
							tmpVirtualSymbolName = `VFP_${tmpVirtualSymbolIndex}`;
							tmpVirtualSymbolIndex++;
						}
						tmpPostfixTokenObject.VirtualSymbolName = tmpVirtualSymbolName;
					}
					else
					{
						tmpPostfixTokenObject.IsFunction = false;
						let tmpVirtualSymbolName = tmpResults.PostfixLayerstackMap[tmpPostfixTokenObject.VirtualSymbolName];
						if (!tmpVirtualSymbolName)
						{
							// This is a parenthesis group with no operators in it; make a virtual symbol name.
							tmpVirtualSymbolName = `VP_${tmpVirtualSymbolIndex}`;
							tmpVirtualSymbolIndex++;
						}
						tmpPostfixTokenObject.VirtualSymbolName = tmpVirtualSymbolName;
					}
					tmpFunctionCacheLIFOStack.push(tmpPostfixTokenObject);
				}
				else if (tmpPostfixTokenObject.Token === ')')
				{
					let tmpOpenParenthesis = tmpFunctionCacheLIFOStack.pop();
					if (!tmpOpenParenthesis)
					{
						tmpResults.ExpressionParserLog.push(`ERROR: ExpressionParser.buildPostfixedSolveList found a closing parenthesis at token index ${i} with no corresponding opening parenthesis.`);
						continue;
					}

					if (tmpOpenParenthesis.IsFunction)
					{
						tmpPostfixTokenObject.IsFunction = true;
						tmpPostfixTokenObject.VirtualSymbolName = tmpOpenParenthesis.Function.VirtualSymbolName;
					}
					else
					{
						tmpPostfixTokenObject.IsFunction = false;
						tmpPostfixTokenObject.VirtualSymbolName = tmpOpenParenthesis.VirtualSymbolName
					}
				}
			}
		}

		// 5.2: Bind every binary operator in each layer to the operands order of operations gives it.
		let tmpSolveLayerRootMap = {};
		for (let tmpSolveLayerIndex = 0; tmpSolveLayerIndex < tmpSolveLayerKeys.length; tmpSolveLayerIndex++)
		{
			tmpSolveLayerRootMap[tmpSolveLayerKeys[tmpSolveLayerIndex]] = this.resolveSolveLayerOperands(tmpSolveLayerMap[tmpSolveLayerKeys[tmpSolveLayerIndex]]);
		}

		// 5.3: Generate the Postfix Solve List
		for (let tmpSolveLayerIndex = 0; tmpSolveLayerIndex < tmpSolveLayerKeys.length; tmpSolveLayerIndex++)
		{
			let tmpSolveLayerTokens = tmpSolveLayerMap[tmpSolveLayerKeys[tmpSolveLayerIndex]];
			let tmpSolveLayerRoot = tmpSolveLayerRootMap[tmpSolveLayerKeys[tmpSolveLayerIndex]];

			// A layer that is one plain value or one parenthesis group (with no operation of its own) is an assignment.
			// The root layer needs none for a group: the group's own last step is already the final result.
			let tmpSoleOperandToken = false;
			if (tmpSolveLayerTokens.length === 1)
			{
				tmpSoleOperandToken = tmpSolveLayerTokens[0];
			}
			else if (tmpSolveLayerRoot && !tmpSolveLayerRoot.IsOperation &&
				!((tmpSolveLayerKeys[tmpSolveLayerIndex] === tmpRootSolveLayer) && (tmpSolveLayerRoot.Token.Type === 'Token.Parenthesis')))
			{
				tmpSoleOperandToken = tmpSolveLayerRoot.Token;
			}

			if (tmpSoleOperandToken)
			{
				// TODO: I think this is correct but with the addition of multiple assignment operators it's less clear.
				let tmpAbstractAssignToken = this.getTokenContainerObject('=');
				tmpAbstractAssignToken.VirtualSymbolName = tmpResults.PostfixLayerstackMap[tmpSolveLayerKeys[tmpSolveLayerIndex]];
				// If this doesn't have a matching solvelayerstack, get the virtual symbol name from the parenthesis group it's in
				if (!tmpAbstractAssignToken.VirtualSymbolName)
				{
					for (let i = 0; i < tmpResults.PostfixTokenObjects.length; i++)
					{
						if (tmpResults.PostfixTokenObjects[i].ParenthesisStack === tmpSolveLayerKeys[tmpSolveLayerIndex])
						{
							tmpAbstractAssignToken.VirtualSymbolName = tmpResults.PostfixTokenObjects[i].VirtualSymbolName;
							break;
						}
					}
				}
				if (!tmpAbstractAssignToken.VirtualSymbolName)
				{
					tmpAbstractAssignToken.VirtualSymbolName = `V_SingleValue_${tmpVirtualSymbolIndex}`;
					tmpVirtualSymbolIndex++;
				}
				tmpResults.PostfixSolveList.push(this.getPosfixSolveListOperation(tmpAbstractAssignToken, tmpSoleOperandToken, this.getTokenContainerObject('0.0')));
				continue;
			}

			// For each precedence level in the layer
			for (let tmpPrecedence = 0; tmpPrecedence <= this.ExpressionParser.tokenMaxPrecedence; tmpPrecedence++)
			{
				// Enumerate all tokens in a layer's expression.
				// There is a recursive way to do this, but given the short length of even the most complex equations we're favoring readability.
				for (let tmpTokenIndex = 0; tmpTokenIndex < tmpSolveLayerTokens.length; tmpTokenIndex++)
				{
					// Unary operators (Precedence 1) solve right to left, so in a chain like `- -X` the inner one is solved first.
					let i = (tmpPrecedence === 1) ? (tmpSolveLayerTokens.length - 1 - tmpTokenIndex) : tmpTokenIndex;
					// If the token is an operator and at the current precedence, add it to the postfix solve list and mutate the array.
					if ((tmpSolveLayerTokens[i].Type === 'Token.Operator') &&
						(tmpSolveLayerTokens[i].Descriptor.Precedence === tmpPrecedence))
					{
						let tmpToken = tmpSolveLayerTokens[i];
						// The - at the beginning of an expression is a number line orientation modifier
						if ((i == 0) && (tmpToken.Token == '-'))
						{
							// The number line negation operator is a special case that generates a virtual constant (-1.0) and multiplies it by the next token
							// This is an abstract operation that isn't in the expression.
							let tmpAbstractMultiplyToken = this.getTokenContainerObject('*');
							tmpAbstractMultiplyToken.VirtualSymbolName = tmpToken.VirtualSymbolName;
							tmpResults.PostfixSolveList.push(this.getPosfixSolveListOperation(tmpAbstractMultiplyToken, this.getTokenContainerObject('-1.0'), tmpSolveLayerTokens[i+1]));
						}
						// The - after an operator or an open parenthesis is also a number line orientation modifier
						else if ((i > 0) && (tmpToken.Token == '-') && ((tmpSolveLayerTokens[i-1].Type === 'Token.Operator') || (tmpSolveLayerTokens[i-1].Token === '(')))
						{
							// The number line negation operator is a special case that generates a virtual constant (-1.0) and multiplies it by the next token
							let tmpAbstractMultiplyToken = this.getTokenContainerObject('*');
							tmpAbstractMultiplyToken.VirtualSymbolName = tmpToken.VirtualSymbolName;
							tmpResults.PostfixSolveList.push(this.getPosfixSolveListOperation(tmpAbstractMultiplyToken, this.getTokenContainerObject('-1.0'), tmpSolveLayerTokens[i+1]));
						}
						// The + at the beginning is also a number line orientation modifier ... THAT WE IGNORE
						else if ((i == 0) && (tmpToken.Token == '+'))
						{
							continue;
						}
						// The + after an operator or a parenthesis is also a number line orientation modifier ... THAT WE IGNORE
						else if ((i > 0) && (tmpToken.Token == '+') && ((tmpSolveLayerTokens[i-1].Type === 'Token.Operator') || (tmpSolveLayerTokens[i-1].Token === '(')))
						{
							continue;
						}

						// Finally add the dang thing.
						else
						{
							let tmpLeftOperandToken = ('LeftOperandToken' in tmpToken) ? tmpToken.LeftOperandToken : tmpSolveLayerTokens[i-1];
							let tmpRightOperandToken = ('RightOperandToken' in tmpToken) ? tmpToken.RightOperandToken : tmpSolveLayerTokens[i+1];
							tmpResults.PostfixSolveList.push(this.getPosfixSolveListOperation(tmpToken, tmpLeftOperandToken, tmpRightOperandToken, tmpSolveLayerTokens, i));
						}
					}
					else if ((tmpSolveLayerTokens[i].Type === 'Token.Function') && (tmpPrecedence === 0))
					{
						let tmpToken = tmpSolveLayerTokens[i];
						tmpResults.PostfixSolveList.push(this.getPosfixSolveListOperation(tmpToken, tmpSolveLayerTokens[i+1], this.getTokenContainerObject('0.0')));
					}
				}
			}
		}

		// 7. Lastly set the assignment address.
		let tmpAbstractAssignToken = ('PostfixedAssignmentOperator' in tmpResults) ? this.getTokenContainerObject(tmpResults.PostfixedAssignmentOperator.Token) : this.getTokenContainerObject('=');
		// The address we are assigning to
		tmpAbstractAssignToken.VirtualSymbolName = tmpResults.PostfixedAssignmentAddress;
		// The address it's coming from
		let tmpSolveResultToken = this.getTokenContainerObject('Result', 'Token.LastResult');
		let tmpFinalAssignmentInstruction = this.getPosfixSolveListOperation(tmpAbstractAssignToken, tmpSolveResultToken, this.getTokenContainerObject('SolverMarshal', 'Token.SolverMarshal'));
		tmpResults.PostfixSolveList.push(tmpFinalAssignmentInstruction);

		return tmpResults.PostfixSolveList;
	}
}

module.exports = ExpressionParserPostfix;
