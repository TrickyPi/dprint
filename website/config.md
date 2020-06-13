# Configuration

Configuration allows you to modify how dprint and its plugins behave.

## Setup

See [Setup](setup).

## Example

```json
{
  "$schema": "https://dprint.dev/schemas/v0.json",
  "projectType": "commercialTrial",
  "lineWidth": 80,
  "typescript": {
    // This applies to both JavaScript & TypeScript
    "quoteStyle": "preferSingle",
    "binaryExpression.operatorPosition": "sameLine"
  },
  "json": {
    "indentWidth": 2
  },
  "includes": [
    "**/*.{ts,tsx,js,jsx,json}"
  ],
  "excludes": [
    "**/node_modules",
    "**/*-lock.json"
  ],
  "plugins": [
    // You may specify any urls or file paths here that you wish.
    "https://plugins.dprint.dev/typescript-x.x.x.wasm",
    "https://plugins.dprint.dev/json-x.x.x.wasm"
  ]
}
```

## `$schema`

This property is optional and provides auto-completion support in Visual Studio Code.

## Project Type

The `"projectType"` specifies the type of license being used to format the project.

You must specify any of the following values:

* `"openSource"` - Dprint is formatting an open source project not run by a for-profit company or for-profit individual (free).
* `"student"` - Dprint is formatting a project run by a student or for educational purposes (free).
* `"nonProfit"` - Dprint is formatting a project maintained by a non-profit organization (free).
* `"commercialPaid"` - Dprint is formatting a commercial project AND the primary maintainer's company paid for a commercial license. Thank you for being part of moving this project forward!
* `"commercialTrial"` - Dprint is formatting a commercial project and it is being evaluated for 30 days.

See [Pricing](https://dprint.dev/pricing) for more details.

## Plugins

The `plugins` property specifies which plugins to use for formatting. These may be URLs or file paths to a web assembly file of the plugin.

```json
{
  // ...omitted...
  "plugins": [
    // You may specify any urls or file paths here that you wish.
    "https://plugins.dprint.dev/typescript-x.x.x.wasm",
    "https://plugins.dprint.dev/json-x.x.x.wasm"
  ]
}
```

Alternatively, these may be provided to the CLI via the `--plugins <plugin urls or file paths...>` flag.

Note: The order of the plugins in this array defines the precedence. If two plugins support the same file extension then define the one you want to format that extension with first.

## Includes and Excludes

The `includes` and `excludes` properties specify the file paths to include and exclude from formatting.

These should be file globs according to [`gitignore`'s extended glob syntax](https://git-scm.com/docs/gitignore#_pattern_format):

```json
{
  // ...omitted...
  "includes": [
    "**/*.{ts,tsx,js,jsx,json}"
  ],
  "excludes": [
    "**/node_modules",
    "**/*-lock.json"
  ]
}
```

## Extending a Different Configuration File

You may extend other configuration files by specifying an `extends` property. This may be a file path or URL.

```json
{
  "extends": "https://dprint.dev/path/to/config/file.v1.json",
  // ...omitted...
}
```

Note: The `includes` and `excludes` of extended configuration is ignored for security reasons so you will need to specify them in the main configuration file or via the CLI.

## Global Configuration

There are certain non-language specific configuration that can be specified. These are specified on the main configuration object, but can be overridden on a per-language basis.

For example:

```json
{
    "projectType": "openSource",
    "lineWidth": 160,
    "useTabs": true,
    "typescript": {
        "lineWidth": 80
    },
    "json": {
        "indentWidth": 2,
        "useTabs": false
    },
    "plugins": [
        // etc...
    ]
}
```

### `lineWidth`

The width of a line the formatter will try to stay under. Note that this limit will be exceeded in certain cases.

Defaults to `120`.

### `indentWidth`

The number of spaces for an indent when using spaces or the number of characters to treat an indent as when using tabs.

Defaults to `4`.

### `useTabs`

Whether to use tabs (`true`) or spaces (`false`).

Defaults to `false`.

Next step: [CLI](cli)