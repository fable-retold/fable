# countsetelements

Counts the elements in a set/array (its length), the keys of an object, or 1/0 for scalars. It does NOT deduplicate — for a distinct count, compose with `distributionhistogram`: `COUNTSETELEMENTS(DISTRIBUTIONHISTOGRAM(set))`.

## Syntax

```
countsetelements(set)
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `set` | Array | The array to count unique elements from |

## Returns

String - The number of unique elements in the set.

## Description

The `countsetelements` function counts the number of unique (distinct) elements in an array. Duplicate values are only counted once.

## Examples

### Basic Usage

```expression
Result = COUNTSETELEMENTS([1, 2, 2, 3, 3, 3, 4])
// Result: "4" (unique values: 1, 2, 3, 4)
```

### Unique Categories

```expression
UniqueCategories = COUNTSETELEMENTS(FLATTEN(AppData.Products.category))
```

### Distinct Users

```expression
UniqueUsers = COUNTSETELEMENTS(FLATTEN(AppData.Transactions.userId))
```

## Use Cases

- **Unique counts**: Count distinct values
- **Deduplication**: Count after removing duplicates
- **Analysis**: Cardinality of datasets
- **Validation**: Verify uniqueness

## Related Functions

- [count](./count.md) - Count all elements (including duplicates)
- [countset](./countset.md) - Count set elements
- [distributionhistogram](./distributionhistogram.md) - Count by value

## Notes

- Only counts unique values
- Duplicates counted once
- Uses the Math service's `countSetElements` method
