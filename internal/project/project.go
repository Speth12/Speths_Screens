// Package project provides the Speth's Screens project format types and loader.
// types.go is GENERATED — do not edit. Edit schema.json and run npm run gen:types.
package project

// Project is the root document type (quicktype generates this as Types).
type Project = Types

// DatasourceType constants match schema.json enum.
const (
	DatasourceTypeOPCUA   DatasourceType = "opcua"
	DatasourceTypeModbus  DatasourceType = "mbtcp"
	DatasourceTypeMQTT    DatasourceType = "mqtt"
	DatasourceTypeREST    DatasourceType = "rest"
	DatasourceTypeVirtual DatasourceType = "virtual"
)
