# generatearrayofobjectsfromsets

Generates an array of objects from parallel arrays.

## Syntax

```
generatearrayofobjectsfromsets(name1, array1, name2, array2, ...)
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `name1, name2, ...` | String | Property name for each following array |
| `array1, array2, ...` | Array | Parallel value arrays (zipped by index) |

## Returns

Array - Array of objects with properties from keys and values from arrays.

## Description

The `generatearrayofobjectsfromsets` function creates an array of objects by combining property names with parallel arrays of values. Each object gets its properties from corresponding positions in the value arrays.

## Examples

### Basic Usage

```expression
Keys = ["name", "age"]
Names = ["Alice", "Bob", "Carol"]
Ages = [25, 30, 35]

Result = GENERATEARRAYOFOBJECTSFROMSETS(Keys, [Names, Ages])
// Result: [
//   { name: "Alice", age: 25 },
//   { name: "Bob", age: 30 },
//   { name: "Carol", age: 35 }
// ]
```

### From CSV Columns

```expression
Headers = ["id", "product", "price"]
Column1 = ["001", "002", "003"]
Column2 = ["Widget", "Gadget", "Thing"]
Column3 = [9.99, 19.99, 4.99]

Records = GENERATEARRAYOFOBJECTSFROMSETS(Headers, [Column1, Column2, Column3])
```

## Use Cases

- **Data transformation**: Convert columnar to row data
- **CSV processing**: Build objects from columns
- **Parallel arrays**: Combine related arrays
- **Data generation**: Create structured data

## Related Functions

- [createvalueobjectbyhashes](./createvalueobjectbyhashes.md) - Create single object
- [objectkeystoarray](./objectkeystoarray.md) - Extract keys
- [flatten](./flatten.md) - Flatten arrays

## Notes

- Value arrays should have same length
- Uses the Math service's `generateArrayOfObjectsFromSets` method
