# ExpressionParser Service

The ExpressionParser service provides mathematical expression parsing and evaluation with arbitrary precision support. It converts infix expressions to postfix (Reverse Polish) notation internally and evaluates them using the Math service.

## Access

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });

// On-demand service - instantiate when needed
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');
console.log('parser:', typeof parser);
```

## Basic Usage

### The `solve()` Method

The primary method is `solve()`, which parses and evaluates expressions:

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

console.log(parser.solve('1 + 1'));        // Returns '2'
console.log(parser.solve('10 * 2'));       // Returns '20'
console.log(parser.solve('100 / 4'));      // Returns '25'
console.log(parser.solve('2 ^ 10'));       // Returns '1024'
```

### Full Signature

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

// Signature shape - see the runnable examples below for real invocations.
console.log('solve signature: (expression, dataObject, resultObject, manifest, destinationObject) =>',
    typeof parser.solve);
```

- **expression** -- the expression string to evaluate
- **dataObject** -- object containing variable values (optional)
- **resultObject** -- object to store solver metadata/logs (optional)
- **manifest** -- a Manyfest instance for address resolution, or `false` (optional)
- **destinationObject** -- object where named results are written (optional)

### Assigning Results

Use `=` to assign a result to a named destination:

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

const dest = {};
parser.solve('Area = 5 * 10', {}, {}, false, dest);
console.log(dest);
// dest.Area === '50'
```

### Null Coalescence Assignment

Use `?=` to only assign if the destination property doesn't already exist:

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

fable.AppData = { Students: ['Alice', 'Bob'] };
const data = fable;
const dest = {};
parser.solve('Name ?= GETVALUE("AppData.Students[0]")', data, {}, false, dest);
console.log('dest.Name (first run):', dest.Name);

// Second run with Name already set - ?= leaves it alone:
parser.solve('Name ?= "OverwriteAttempt"', data, {}, false, dest);
console.log('dest.Name (after ?= retry):', dest.Name);
```

## Operators

### Arithmetic Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `+` | Addition | `5 + 3` -> `'8'` |
| `-` | Subtraction | `5 - 3` -> `'2'` |
| `*` | Multiplication | `5 * 3` -> `'15'` |
| `/` | Division | `15 / 3` -> `'5'` |
| `^` | Power | `2 ^ 3` -> `'8'` |
| `%` | Modulus | `10 % 3` -> `'1'` |

### Comparison Operators

Comparison operators evaluate to `'1'` (true) or `'0'` (false). They bind looser than arithmetic, so `2 + 3 > 1 + 2` evaluates the math first.

| Operator | Description | Example |
|----------|-------------|---------|
| `>` | Greater than | `5 > 3` -> `'1'` |
| `>=` | Greater than or equal | `5 >= 5` -> `'1'` |
| `<` | Less than | `3 < 5` -> `'1'` |
| `<=` | Less than or equal | `3 <= 3` -> `'1'` |
| `==` | Equal | `5 == 5` -> `'1'` |
| `!=` | Not equal | `5 != 3` -> `'1'` |

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

const dest = {};
parser.solve('Result = 5 > 3', {}, {}, false, dest);
console.log("after '5 > 3':", dest.Result);

parser.solve('Result = 2 + 3 > 1 + 2', {}, {}, false, dest);
console.log("after '2 + 3 > 1 + 2':", dest.Result);

parser.solve('Result = Height > Width', { Height: 10, Width: 5 }, {}, false, dest);
console.log("after 'Height > Width':", dest.Result);
```

### Ternary Operator

The ternary operator provides inline conditional expressions using `?` and `::` syntax:

```
condition ? trueValue :: falseValue
```

The condition is typically a comparison expression. If it evaluates to a truthy value (non-zero, non-empty), the true branch is returned; otherwise the false branch is returned.

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

const dest = {};

parser.solve('Result = 5 > 3 ? 100 :: 200', {}, {}, false, dest);
console.log('5>3 ? 100 :: 200 =>', dest.Result);

parser.solve('Result = 3 > 5 ? 100 :: 200', {}, {}, false, dest);
console.log('3>5 ? 100 :: 200 =>', dest.Result);

parser.solve('Winner = Height > Width ? Height :: Width',
    { Height: 10, Width: 5 }, {}, false, dest);
console.log('Winner =', dest.Winner);

// Arithmetic in branches
parser.solve('Result = A > B ? A + 1 :: B + 1',
    { A: 10, B: 5 }, {}, false, dest);
console.log('Branch arithmetic =', dest.Result);

// Nested ternary (use parentheses for inner ternary)
parser.solve('Result = A > 0 ? (B > 0 ? 1 :: 2) :: 3',
    { A: 1, B: 1 }, {}, false, dest);
console.log('Nested ternary =', dest.Result);
```

The ternary operator uses `::` (double colon) instead of `:` for the false branch separator because `:` is already used as the Expression Begin token in directives like `MAP`, `SERIES`, etc.

Internally, `condition ? trueValue :: falseValue` is desugared to `ternary((condition), trueValue, falseValue)` before evaluation. See the [ternary function documentation](./expression-parser-functions/ternary.md) for details.

### Order of Operations

Parentheses and function calls are solved first. Operators then bind in this order, tightest first; operators in the same row are evaluated left to right.

| Order | Operators | Notes |
|-------|-----------|-------|
| 1 | unary `-`, unary `+` | `-2 ^ 2` is `(-2) ^ 2` -> `'4'` (the usual math convention would give `-4`) |
| 2 | `^` | Left-associative: `2 ^ 3 ^ 2` is `(2 ^ 3) ^ 2` -> `'64'` |
| 3 | `*` `/` `%` | |
| 4 | `+` `-` | |
| 5 | `>` `>=` `<` `<=` `==` `!=` | |
| 6 | `,` | Separates function arguments |

Each function argument is a full expression, so `IF(X, ">", 0, X * Y + X, 0)` returns the value of `X * Y + X`.

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

console.log(parser.solve('5 + 2 * 10'));           // Returns '25'
console.log(parser.solve('3.5 + 5 + 10 * 10 / 5'));  // Returns '28.5'
console.log(parser.solve('(100 - 10)'));           // Returns '90'
console.log(parser.solve('1 + 2 ^ 2 * 3'));        // Returns '13'
console.log(parser.solve('2 - -3 * 2'));           // Returns '8'
```

### Negative Numbers

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

const dest = {};
parser.solve('Value = -3', {}, {}, false, dest);
console.log('dest.Value:', dest.Value);

parser.solve('Value2 = (4 + -3)', {}, {}, false, dest);
console.log('dest.Value2:', dest.Value2);
```

## Variables

### Using Data Objects

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

console.log(parser.solve('X * Y * Z', { X: 5, Y: 3.1, Z: 75 }));

const dest = {};
parser.solve('Area = X * Y * Z', { X: 5.867, Y: 3.1, Z: 75 }, {}, false, dest);
console.log('dest.Area:', dest.Area);
```

### Accessing Fable AppData

Use `GETVALUE()` to read from `fable.AppData`:

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

const dest = {};

fable.AppData = { Pit: 'Bottomless' };
parser.solve('PitSize = getvalue("AppData.Pit")', fable, {}, false, dest);
console.log('PitSize:', dest.PitSize);

fable.AppData = { Students: ['Kim', 'Jim', 'Joan Jett', 'Tank Girl'] };
parser.solve('Name = GETVALUE("AppData.Students[1]")', fable, {}, false, dest);
console.log('Name:', dest.Name);
```

## Built-in Functions

### Math Functions

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

console.log(parser.solve('sqrt(16)'));
console.log(parser.solve('sin(rad(60))'));
console.log(parser.solve('1.5 * sqrt(8 * 2.423782342^2) / 10'));
```

### Rounding

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

console.log(parser.solve('ROUND(X * Y * Z)', { X: 5.867, Y: 3.1, Z: 75 }));
console.log(parser.solve('ROUND(X * Y * Z, 2)', { X: 5.867, Y: 3.1, Z: 75 }));
console.log(parser.solve('ROUND(X * Y * Z, 3, 3)', { X: 5.867, Y: 3.5, Z: 75.248923423 }));
```

### Aggregate Functions (on Arrays)

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

console.log(parser.solve('SUM(ItemCosts)',    { ItemCosts: [100, 200, 50, 45, 5] }));
console.log(parser.solve('MEAN(ItemCosts)',   { ItemCosts: [100, 200, 50, 45, 5] }));
console.log(parser.solve('MEDIAN(ItemCosts)', { ItemCosts: [100, 200, 50, 45, 5] }));
console.log(parser.solve('COUNT(ItemCosts)',  { ItemCosts: [100, 200, 50, 45, 5] }));
console.log(parser.solve('STDEV(Values)',     { Values: [1,2,3,4,5,6,7,8,9,10,11] }));
console.log(parser.solve('STDEVP(Values)',    { Values: [1,2,3,4,5,6,7,8,9,10,11] }));
```

### String Functions

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

fable.AppData = {
    Cities:    [{ city: 'Phoenix' }, { city: 'Denver' }, { city: 'Boston' }],
    CityNames: ['Phoenix', 'Denver', 'Boston']
};

console.log(parser.solve('Names = concat(AppData.Cities[].city)', fable));
// Concatenates all city names (skipping non-string values)

console.log(parser.solve('JoinedNames = join("&comma; ", AppData.CityNames)', fable));
// Joins with separator, resolving HTML entities

console.log(parser.solve('NameList = STRINGGETSEGMENTS(Names, ",")', { Names: 'Jane,John' }));
// Returns ['Jane', 'John']
```

### Conditional Functions

#### Ternary Operator (inline conditional)

The preferred way to write inline conditionals is with the ternary operator:

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

const dest = {};
parser.solve('Label = Score >= 70 ? "Pass" :: "Fail"', { Score: 85 }, {}, false, dest);
console.log('dest.Label:', dest.Label);
```

See [Ternary Operator](#ternary-operator) above and the [ternary function reference](./expression-parser-functions/ternary.md).

#### When (truthy check)

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

fable.AppData = { Cities: [{ city: 'Phoenix' }] };
const dest = {};
parser.solve('Name = When(AppData.Cities[0].city, AppData.Cities[0].city)', fable, {}, false, dest);
console.log('dest.Name:', dest.Name);
```

#### If (comparison)

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

const data = { latitude: 42, city: 'New York' };
const dest = {};
parser.solve('GTE = If(latitude, "<", "50", "west", "east")', data, {}, false, dest);
console.log('dest.GTE:', dest.GTE);

// Supports ==, ===, <, >, LT, LTE, GT, GTE operators
parser.solve('Equals = If(city, "==", "New York", "yes", "no")', data, {}, false, dest);
console.log('dest.Equals:', dest.Equals);
```

### Date Functions

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

console.log(parser.solve('Result = datemilliseconddifference("2023-08-10T05:00:00.000Z", "2023-08-11T05:00:00.000Z")'));
console.log(parser.solve('Result = datehourdifference(StartDate, EndDate)',
    { StartDate: '2023-08-10T05:00:00.000Z', EndDate: '2023-08-11T05:00:00.000Z' }));
console.log(parser.solve('DATEFROMPARTS(2025, 4, 1)'));
console.log(parser.solve('DATEADDDAYS(DATEFROMPARTS(2025, 4, 1, 13, 03, 51, 761), 87)'));
```

Also available: `dateseconddifference`, `dateminutedifference`, `datedaydifference`, `dateweekdifference`, `datemonthdifference`, `dateyeardifference`.

### Histogram and Aggregation Functions

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

fable.AppData = {
    Cities: [
        { state: 'Alabama',  population: 1000 },
        { state: 'Alabama',  population: 2000 },
        { state: 'Colorado', population: 3000 }
    ]
};

const dest = {};

// Count distribution by field
parser.solve('Result = distributionhistogram("AppData.Cities", "state")', fable, {}, false, dest);
console.log('distribution:', dest.Result);

// Sum a numeric field grouped by another field
parser.solve('Result = aggregationHistogram("AppData.Cities", "state", "population")', fable, {}, false, dest);
console.log('aggregation:', dest.Result);
```

### Data Generation Functions

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

console.log(parser.solve('RandomIntValue = RANDOMINTEGER()'));
console.log(parser.solve('RandomIntValueBetween = RANDOMINTEGERBETWEEN(10, 13)'));
console.log(parser.solve('RandomFloatValue = randomFloat()'));
console.log(parser.solve('RandomFloatValueBetween = randomFloatBetween(10.5, 13.78)'));
```

### Array Functions

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

fable.AppData = {
    Cities: [
        { population: 100, latitude: 40 },
        { population: 200, latitude: 41 }
    ]
};

console.log(parser.solve('SLICE(W, 0, 1)', { W: ['3', '4', '5'] }));
console.log(parser.solve('FLATTEN(AppData.Cities[].population, AppData.Cities[].latitude)', fable));
```

## Advanced Features

### MAP Expressions

Map over arrays to transform values:

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

const manifest = fable.newManyfest();
const dest = {};

// Simple map
parser.solve('Result = MAP VAR x FROM Values : x + 100',
    { Values: [1, 2, 3, 4, 5] }, {}, manifest, dest);
console.log('Simple map:', dest.Result);

// Multi-variable map (cross product)
const data = { Cities: [{ population: 1 }, { population: 2 }], Values: [10, 20] };
parser.solve('Result = MAP VAR city FROM Cities VAR x FROM Values : city.population + (x * 1000000000000000)',
    data, {}, manifest, dest);
console.log('Cross-product map:', dest.Result);
```

### SERIES Expressions

Generate series of computed values:

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

const manifest = fable.newManyfest();
const dest = {};

parser.solve('Result = SERIES FROM 13.2 TO 25 STEP 0.2 : 1000 + (n / 2)',
    {}, {}, manifest, dest);
console.log('Series first elt:', dest.Result[0]);

// With stepIndex variable
parser.solve('Result = SERIES FROM 13.2 TO 25 STEP 0.5 : (1000 * stepIndex) + n',
    {}, {}, manifest, dest);
console.log('stepIndex series first elt:', dest.Result[0]);

// Variables can be used for FROM, TO, STEP
const appData = { StartValue: 1, EndValue: 5, StepValue: 1, BaseValue: 100 };
parser.solve('XValues = SERIES FROM StartValue TO EndValue STEP StepValue : (BaseValue * stepIndex) + n',
    appData, {}, manifest, appData);
console.log('appData.XValues:', appData.XValues);
```

### MONTECARLO Expressions

Run Monte Carlo simulations:

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

const manifest = fable.newManyfest();
const dest = {};

parser.solve('Result = MONTECARLO SAMPLECOUNT 1000 VAR x PT x 50 PT x 100 : 10000000 + x',
    {}, {}, manifest, dest);
console.log('Samples count:', dest.Result.Samples.length);

// Multi-variable Rosenbrock function
parser.solve('Result = MONTECARLO SAMPLECOUNT 5000 VAR x PT x -3 PT x 3 VAR y PT y -1 PT y 5 : (1 - x)^2 + 100 * (y - x^2)^2',
    {}, {}, manifest, dest);
console.log('Rosenbrock samples:', dest.Result.Samples.length);
```

### MULTIROWMAP Expressions

Iterate over an array of objects (rows) with multi-row lookback and lookahead. Each variable can reference the current row or any row at a relative offset, with configurable defaults for out-of-bounds access.

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

const manifest = fable.newManyfest();
const dest = {};

// Syntax:
// Result = MULTIROWMAP ROWS FROM <address>
//   [SERIESSTART <n>] [SERIESSTEP <n>]
//   VAR <name> FROM <property> [OFFSET <n>] [DEFAULT <value>]
//   ... : <expression>

// Basic: compute area from each row's Width and Height
parser.solve('Areas = MULTIROWMAP ROWS FROM Rows VAR w FROM Width VAR h FROM Height : w * h',
    { Rows: [{Width:10,Height:20}, {Width:30,Height:40}] }, {}, manifest, dest);
console.log('Areas:', dest.Areas);

// Sample data for the remaining MULTIROWMAP variants
const data = {
    Prices:  [{ Close: 100 }, { Close: 102 }, { Close: 101 }, { Close: 105 }, { Close: 110 }],
    FibRows: [{ Fib: 0 }, { Fib: 1 }, { Fib: 1 }, { Fib: 2 }, { Fib: 3 }, { Fib: 5 }],
    Rows:    [{ Value: 1 }, { Value: 2 }, { Value: 3 }, { Value: 4 }]
};

// Previous row lookback (day-over-day change)
parser.solve('Change = MULTIROWMAP ROWS FROM Prices VAR Today FROM Close VAR Yesterday FROM Close OFFSET -1 DEFAULT 0 : Today - Yesterday',
    data, {}, manifest, dest);
console.log('Change:', dest.Change);

// Two-row lookback (Fibonacci verification)
parser.solve('Check = MULTIROWMAP ROWS FROM FibRows VAR Cur FROM Fib VAR P1 FROM Fib OFFSET -1 DEFAULT 0 VAR P2 FROM Fib OFFSET -2 DEFAULT 0 : Cur - (P1 + P2)',
    data, {}, manifest, dest);
console.log('Fib Check:', dest.Check);

// Forward lookback (next row reference)
parser.solve('NextDiff = MULTIROWMAP ROWS FROM Rows VAR Cur FROM Value VAR Next FROM Value OFFSET 1 DEFAULT 0 : Next - Cur',
    data, {}, manifest, dest);
console.log('NextDiff:', dest.NextDiff);

// Central difference (both directions)
parser.solve('Deriv = MULTIROWMAP ROWS FROM Rows VAR Prev FROM Value OFFSET -1 DEFAULT 0 VAR Next FROM Value OFFSET 1 DEFAULT 0 : (Next - Prev) / 2',
    data, {}, manifest, dest);
console.log('Deriv:', dest.Deriv);

// SERIESSTART: skip initial rows (start from row 2)
parser.solve('MA = MULTIROWMAP ROWS FROM Prices SERIESSTART 2 VAR c0 FROM Close VAR c1 FROM Close OFFSET -1 DEFAULT 0 VAR c2 FROM Close OFFSET -2 DEFAULT 0 : (c0 + c1 + c2) / 3',
    data, {}, manifest, dest);
console.log('MA:', dest.MA);

// Negative SERIESSTART: start from 2 rows before end
parser.solve('LastTwo = MULTIROWMAP ROWS FROM Rows SERIESSTART -2 VAR v FROM Value : v + 0',
    data, {}, manifest, dest);
console.log('LastTwo:', dest.LastTwo);

// SERIESSTEP -1: iterate backwards
parser.solve('Reversed = MULTIROWMAP ROWS FROM Rows SERIESSTART -1 SERIESSTEP -1 VAR v FROM Value : v + 0',
    data, {}, manifest, dest);
console.log('Reversed:', dest.Reversed);

// SERIESSTEP 2: every other row
parser.solve('Sampled = MULTIROWMAP ROWS FROM Rows SERIESSTEP 2 VAR v FROM Value : v + 0',
    data, {}, manifest, dest);
console.log('Sampled:', dest.Sampled);
```

**Available variables in MULTIROWMAP expressions:**
- `stepIndex` -- iteration counter (0, 1, 2, ...)
- `rowIndex` -- actual array index of the current row
- Any VAR-mapped variable names

**OFFSET values:**
- `0` (default) -- current row
- `-1` -- previous row, `-2` -- two rows back, `-3` -- three back, etc.
- `1` -- next row, `2` -- two ahead, etc.

### ITERATIVESERIES

Run cumulative computations over arrays:

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

console.log(parser.solve('Result = ITERATIVESERIES(Values, "Value", "Resultant", 1, "add")',
    { Values: [{ Value: 10 }, { Value: 20 }, { Value: 5 }] }));
// Returns [{ Value: 10, Resultant: '10' }, { Value: 20, Resultant: '30' }, { Value: 5, Resultant: '35' }]
```

### Linear Regression

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

fable.AppData = {
    Cities: [
        { latitude: 40, population: 100 },
        { latitude: 41, population: 200 },
        { latitude: 42, population: 300 }
    ]
};

const results = {};

// Compute regression coefficients
parser.solve('Coefficients = LINEST(FLATTEN(AppData.Cities[].latitude), FLATTEN(AppData.Cities[].population))',
    fable, results, false, fable.AppData);
console.log('Coefficients:', fable.AppData.Coefficients);

// Predict from coefficients
const data = { Coefficients: fable.AppData.Coefficients, vector: 43 };
const dest = {};
parser.solve('Predicted = PREDICT(Coefficients, vector)', data, results, false, dest);
console.log('Predicted:', dest.Predicted);
```

### Custom Solver Functions

Register custom functions that can be called from expressions:

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

const dest = {};

fable.MonkeyFunction = (pParameter) => { return `Monkey says hello to ${pParameter}`; };
parser.addSolverFunction('monkeypatchedfunction', 'fable.MonkeyFunction', 'Documentation string');

parser.solve('Result = monkeypatchedfunction("Jerry")', fable, {}, false, dest);
console.log('dest.Result:', dest.Result);
```

## Logging and Debugging

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'ExpressionParserDemo', ProductVersion: '1.0.0' });
const parser = fable.instantiateServiceProviderIfNotExists('ExpressionParser');

const resultObject = {};
parser.solve('Z = 1 + 1', {}, resultObject, false, {});

// Access solver result logs
parser.Messaging.logFunctionSolve(resultObject);
console.log('resultObject keys:', Object.keys(resultObject));
```

## Notes

- Uses postfix (Reverse Polish) notation internally for evaluation
- All numeric results are returned as strings for arbitrary precision
- Variables are resolved from the dataObject using Manyfest path notation
- Mismatched parentheses cause the expression to fail without mutating the destination
- Non-numeric values used in arithmetic are treated as zero
- The `===` operator in `If()` does exact string comparison; `==` uses epsilon comparison for numbers
