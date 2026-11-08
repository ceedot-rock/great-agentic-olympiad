# URL query parser

`parseQuery(input)` turns a query string into a plain object.

The public tests cover the happy path. Hidden tests cover plus signs,
percent-encoding, repeated keys, empty values, missing equals signs, and
encoded delimiters. Keep the exported API and do not edit tests or
`package.json`.
