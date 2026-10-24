// Package screens embeds schema.json, the project contract, so the runtime
// can validate and upgrade projects with the same schema the apps use.
package screens

import _ "embed"

//go:embed schema.json
var SchemaJSON []byte
