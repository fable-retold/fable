# distributionhistogram

Counts occurrences of each value in a plain set/array (`uniq -c`): returns
an insertion-ordered `{ value: count }` object. `OBJECTKEYSTOARRAY` of the
result is the set's distinct values; `COUNTSETELEMENTS` of it is the
distinct count. For sets of objects, use `distributionhistogrambyobject`
with a value address.
## Syntax

```
distributionhistogram(dataPath, keyProperty)
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `dataPath` | String | Path to the data array (quoted string) |
| `keyProperty` | String | Property name to count occurrences of |

## Returns

Object - A histogram object with unique values and their counts.

## Description

The `distributionhistogram` function creates a histogram by counting how many times each unique value appears in a dataset. This is useful for understanding the distribution of categorical data.

## Examples

### Basic Usage

```expression
// Given city data with a 'state' property
DistributionResult = distributionhistogram("AppData.Cities", "state")

// Result: {
//   'Alabama': 12,
//   'Colorado': 21,
//   'Florida': 73,
//   'Georgia': 18,
//   // ... etc
// }
```

### Counting Categories

```expression
// Count orders by status
StatusCounts = distributionhistogram("AppData.Orders", "status")
// Result: { 'pending': 45, 'shipped': 123, 'delivered': 89 }
```

### With Verification

```expression
// Verify distribution counts match data
DistributionResult = distributionhistogram("AppData.Cities", "state")
// DistributionResult.Alabama should equal 12
// DistributionResult.Colorado should equal 21
```

## Use Cases

- **Demographic analysis**: Count people by category
- **Survey results**: Tally responses
- **Quality metrics**: Distribution of defect types
- **Inventory**: Count items by category
- **Geographic analysis**: Records per region

## Difference from aggregationhistogram

| distributionhistogram | aggregationhistogram |
|----------------------|---------------------|
| Counts occurrences | Sums values |
| One property (key) | Two properties (key, value) |
| Result: counts | Result: sums |

```expression
// Distribution: How many cities per state?
distributionhistogram("AppData.Cities", "state")
// { 'California': 73, 'Texas': 51, ... }

// Aggregation: Total population per state?
aggregationhistogram("AppData.Cities", "state", "population")
// { 'California': '39538223', 'Texas': '29145505', ... }
```

## Related Functions

- [distributionhistogrambyobject](./distributionhistogrambyobject.md) - Takes object directly
- [aggregationhistogram](./aggregationhistogram.md) - Sum values instead of count
- [count](./count.md) - Simple count of elements

## Notes

- The data path must be a quoted string
- Returns integer counts for each unique value
- Works with the Math service's `histogramDistributionByExactValueFromInternalState` method
