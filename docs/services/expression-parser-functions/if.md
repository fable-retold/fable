# if

Performs a conditional comparison and returns one of two values based on the result.

## Syntax

```
if(left, operator, right, onTrue, onFalse)
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `left` | Any | Left value to compare |
| `operator` | String | Comparison operator |
| `right` | Any | Right value to compare |
| `onTrue` | Any | Value returned if comparison is true |
| `onFalse` | Any | Value returned if comparison is false |

### Comparison Operators

| Operator | Alias | Description |
|----------|-------|-------------|
| `<` | `LT` | Less than |
| `<=` | `LTE` | Less than or equal |
| `>` | `GT` | Greater than |
| `>=` | `GTE` | Greater than or equal |
| `==` | | Loose equality (with small tolerance for numbers) |
| `===` | | Strict equality |

## Returns

The `onTrue` value if the comparison is true, otherwise `onFalse`.

## Description

The `if` function evaluates a condition and returns different values based on the result. It supports both numeric comparisons (with arbitrary precision) and string comparisons.

## Examples

### Basic Comparison

```expression
GTE = If(AppData.Cities[0].latitude, "<", "50", "west", "east")
// If latitude < 50, returns "west", otherwise "east"
// Result: "west"
```

### String Comparison

```expression
Equals = If(AppData.Cities[0].city, "==", "New York", "yes", "no")
// Result: "yes"
```

### Numeric Equality with Tolerance

```expression
// Uses small epsilon for floating point comparison
EpsilonEquals = If("1.0000000001", "==", "1", "yes", "no")
// Result: "yes" (within tolerance)

// Strict equality requires exact match
PreciseEquals = If("1.0000000001", "===", "1", "yes", "no")
// Result: "no" (not exactly equal)
```

### Computed Return Values

```expression
// Return values can be expressions
Computed = If(AppData.Cities[0].latitude, "<", "50", AppData.Cities[0].latitude + 25, AppData.Cities[0].latitude - 25)

// Every argument is a full expression with the normal order of operations
// With X = 3 and Y = 4: X * Y + X = 15
Total = IF(X, ">", 0, X * Y + X, 0)
// Result: "15"
```

### Nested Conditions

```expression
// Chain conditions for multiple outcomes
Grade = IF(Score, ">=", 90, "A", IF(Score, ">=", 80, "B", IF(Score, ">=", 70, "C", "F")))
```

### In Complex Expressions

```expression
// Conditional within larger expressions
WetCount = IF(DryCount, "<=", 30, DryCount, WetCountIntermediate)

// Selecting between computed values
CombinedValues = MAP VAR dry FROM DryValues VAR wet FROM WetValues VAR x from XValues : IF(x, "LTE", Chart.OptimalMoistureContent, dry, wet)
```

## Use Cases

- **Data validation**: Check if values meet criteria
- **Conditional formatting**: Return different display values
- **Business logic**: Apply different rules based on conditions
- **Threshold checks**: Compare against limits

## Related Functions

- [when](./when.md) - Truthy check (simpler conditional)

## Notes

- Uses arbitrary precision for numeric comparisons
- The `==` operator uses a tolerance of 0.000001 for numeric values
- The `===` operator performs exact comparison for numbers
- String comparisons are case-sensitive
