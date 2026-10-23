package project

import "encoding/json"

// Runtime project file — single source of truth. Generated types: internal/project/types.go
// + packages/shared-types/src/project.ts
type Types struct {
	AlarmRules                                               []AlarmRuleElement  `json:"alarmRules,omitempty"`
	Datasources                                              []DatasourceElement `json:"datasources"`
	// Human-readable project name
	Name                                                     *string             `json:"name,omitempty"`
	// Unified Namespace — flat list of namespace nodes (folders, assets, tags).
	Namespace                                                json.RawMessage     `json:"namespace,omitempty"`
	Pages                                                    []PageElement       `json:"pages"`
	// Operator PIN — operator panel locks behind this if set
	Pin                                                      *string             `json:"pin,omitempty"`
	Recipes                                                  []RecipeElement     `json:"recipes,omitempty"`
	// Schema version, e.g. '0.1.0'
	Version                                                  string              `json:"version"`
	// Disable all write widgets in the operator panel
	ViewOnly                                                 *bool               `json:"viewOnly,omitempty"`
}

type AlarmRuleElement struct {
	// datasource_id:tag_path, e.g. 'opcua:ns=2;s=PLCnext.pressure'          
	Binding                                                        string    `json:"binding"`
	Condition                                                      Condition `json:"condition"`
	ID                                                             string    `json:"id"`
	Message                                                        string    `json:"message"`
	Name                                                           string    `json:"name"`
	Severity                                                       Severity  `json:"severity"`
	Threshold                                                      float64   `json:"threshold"`
}

type DatasourceElement struct {
	Config                                              DatasourceConfig `json:"config"`
	// Unique driver instance ID, e.g. 'opcua', 'mbtcp1'                 
	ID                                                  string           `json:"id"`
	Label                                               string           `json:"label"`
	Type                                                DatasourceType   `json:"type"`
}

// Driver-specific connection config. Fields used depend on 'type'.
type DatasourceConfig struct {
	// REST base path, e.g. /_pxc_api/v1.14                                  
	BasePath                                                 *string         `json:"basePath,omitempty"`
	// REST bearer token                                                     
	BearerToken                                              *string         `json:"bearerToken,omitempty"`
	// MQTT client ID                                                        
	ClientID                                                 *string         `json:"clientId,omitempty"`
	// OPC UA: opc.tcp://host:port                                           
	Endpoint                                                 *string         `json:"endpoint,omitempty"`
	// Modbus/MQTT/REST host                                                 
	Host                                                     *string         `json:"host,omitempty"`
	Password                                                 *string         `json:"password,omitempty"`
	// TCP port                                                              
	Port                                                     *int64          `json:"port,omitempty"`
	SecurityMode                                             *SecurityMode   `json:"securityMode,omitempty"`
	SecurityPolicy                                           *SecurityPolicy `json:"securityPolicy,omitempty"`
	// Modbus slave/unit ID                                                  
	SlaveID                                                  *int64          `json:"slaveId,omitempty"`
	// Virtual driver: JSON-encoded [{path,formula}...] array                
	Tags                                                     *string         `json:"tags,omitempty"`
	Username                                                 *string         `json:"username,omitempty"`
}

type PageElement struct {
	ID      string          `json:"id"`
	Name    string          `json:"name"`
	Widgets []WidgetElement `json:"widgets"`
}

type WidgetElement struct {
	// datasource_id:tag_path, e.g. 'opcua:ns=2;s=PLCnext.iTest'
	Binding                                                     *string          `json:"binding,omitempty"`
	// Widget config. Passed through as raw JSON so unknown fields (font, appearance, etc.) are preserved.
	Config                                                      json.RawMessage  `json:"config,omitempty"`
	// Widget dynamics (visibility, opacity, color, script). Passed through as raw JSON.
	Dynamics                                                    json.RawMessage  `json:"dynamics,omitempty"`
	// Height in grid units
	H                                                           int64            `json:"h"`
	ID                                                          string           `json:"id"`
	// IDE-only: widget cannot be moved or resized
	Locked                                                      *bool            `json:"locked,omitempty"`
	Type                                                        WidgetType       `json:"type"`
	// BOOL tag — widget hidden when value is 0/false
	VisibleBinding                                              *string          `json:"visibleBinding,omitempty"`
	// Width in grid units
	W                                                           int64            `json:"w"`
	// Grid column
	X                                                           int64            `json:"x"`
	// Grid row
	Y                                                           int64            `json:"y"`
}

// Per-widget configuration. Fields depend on type.
type WidgetConfig struct {
	// Button action type                                                   
	Action                                          *Action                 `json:"action,omitempty"`
	// Tag path for color threshold evaluation                              
	ColorBinding                                    *string                 `json:"colorBinding,omitempty"`
	// Color threshold rules applied to colorBinding                        
	ColorThresholds                                 []ColorThresholdElement `json:"colorThresholds,omitempty"`
	// Trend history window in seconds                                      
	Duration                                        *int64                  `json:"duration,omitempty"`
	// LED color when false                                                 
	FalseColor                                      *string                 `json:"falseColor,omitempty"`
	// Image object-fit                                                     
	Fit                                             *Fit                    `json:"fit,omitempty"`
	// printf-style format, e.g. '%.2f'                                     
	Format                                          *string                 `json:"format,omitempty"`
	Label                                           *string                 `json:"label,omitempty"`
	Max                                             *float64                `json:"max,omitempty"`
	// AlarmBanner max visible rows                                         
	MaxRows                                         *int64                  `json:"maxRows,omitempty"`
	Min                                             *float64                `json:"min,omitempty"`
	// Button: true=momentary, false=toggle                                 
	Momentary                                       *bool                   `json:"momentary,omitempty"`
	// Button navigate: target page id                                      
	NavigateTo                                      *string                 `json:"navigateTo,omitempty"`
	// Button off/release value                                             
	OffValue                                        interface{}             `json:"offValue"`
	// Button on-press value                                                
	OnValue                                         interface{}             `json:"onValue"`
	// HistoryLog rows per page                                             
	PageSize                                        *int64                  `json:"pageSize,omitempty"`
	// Trend horizontal reference lines                                     
	RefLines                                        []RefLineElement        `json:"refLines,omitempty"`
	// AlarmBanner: show acknowledged alarms                                
	ShowAcked                                       *bool                   `json:"showAcked,omitempty"`
	// Image: data-URL or URL                                               
	Src                                             *string                 `json:"src,omitempty"`
	// MultiState value→label→color map                                     
	States                                          []StateElement          `json:"states,omitempty"`
	// Setpoint slider step                                                 
	Step                                            *float64                `json:"step,omitempty"`
	// Trend multi-series config                                            
	Tags                                            []TagElement            `json:"tags,omitempty"`
	Thresholds                                      []ColorThresholdElement `json:"thresholds,omitempty"`
	// LED color when true                                                  
	TrueColor                                       *string                 `json:"trueColor,omitempty"`
	Unit                                            *string                 `json:"unit,omitempty"`
	// Trend X-axis label format                                            
	XFormat                                         *XFormat                `json:"xFormat,omitempty"`
}

type ColorThresholdElement struct {
	// CSS color, e.g. '#22c55e'
	Color string `json:"color"`
	// Optional upper bound (exclusive). If set, matches value >= Value && value < ToValue.
	// If absent, matches value >= Value (open-ended, highest match wins).
	ToValue *float64 `json:"toValue,omitempty"`
	Value   float64  `json:"value"`
}

type RefLineElement struct {
	Color string  `json:"color"`
	Label *string `json:"label,omitempty"`
	Value float64 `json:"value"`
}

type StateElement struct {
	Color     string      `json:"color"`
	Label     string      `json:"label"`
	TextColor *string     `json:"textColor,omitempty"`
	Value     interface{} `json:"value"`
}

type TagElement struct {
	Binding string   `json:"binding"`
	Color   string   `json:"color"`
	Fill    *bool    `json:"fill,omitempty"`
	Label   *string  `json:"label,omitempty"`
	YMax    *float64 `json:"yMax,omitempty"`
	YMin    *float64 `json:"yMin,omitempty"`
}

type RecipeElement struct {
	Description *string        `json:"description,omitempty"`
	Entries     []EntryElement `json:"entries"`
	ID          string         `json:"id"`
	Name        string         `json:"name"`
}

type EntryElement struct {
	// datasource_id:tag_path            
	Binding                  string      `json:"binding"`
	Value                    interface{} `json:"value"`
}

type Condition string

const (
	Eq  Condition = "eq"
	Gt  Condition = "gt"
	Gte Condition = "gte"
	LTE Condition = "lte"
	Lt  Condition = "lt"
	Ne  Condition = "ne"
)

type Severity string

const (
	Critical Severity = "critical"
	Info     Severity = "info"
	Warning  Severity = "warning"
)

type SecurityMode string

const (
	SecurityModeNone SecurityMode = "None"
	Sign             SecurityMode = "Sign"
	SignAndEncrypt   SecurityMode = "SignAndEncrypt"
)

type SecurityPolicy string

const (
	Basic128Rsa15      SecurityPolicy = "Basic128Rsa15"
	Basic256           SecurityPolicy = "Basic256"
	Basic256Sha256     SecurityPolicy = "Basic256Sha256"
	SecurityPolicyNone SecurityPolicy = "None"
)

type DatasourceType string

const (
	Mbtcp   DatasourceType = "mbtcp"
	Mqtt    DatasourceType = "mqtt"
	Opcua   DatasourceType = "opcua"
	REST    DatasourceType = "rest"
	Virtual DatasourceType = "virtual"
)

// Button action type
type Action string

const (
	Navigate Action = "navigate"
	Write    Action = "write"
)

// Image object-fit
type Fit string

const (
	Contain Fit = "contain"
	Cover   Fit = "cover"
	Fill    Fit = "fill"
)

// Trend X-axis label format
type XFormat string

const (
	Datetime  XFormat = "datetime"
	Relative  XFormat = "relative"
	Time      XFormat = "time"
	TimeShort XFormat = "time-short"
)

type WidgetType string

const (
	AlarmBanner    WidgetType = "alarmBanner"
	Button         WidgetType = "button"
	Gauge          WidgetType = "gauge"
	HistoryLog     WidgetType = "historyLog"
	Image          WidgetType = "image"
	LED            WidgetType = "led"
	MultiState     WidgetType = "multiState"
	NumericDisplay WidgetType = "numericDisplay"
	NumericInput   WidgetType = "numericInput"
	Setpoint       WidgetType = "setpoint"
	Tank           WidgetType = "tank"
	TextDisplay    WidgetType = "textDisplay"
	TextInput      WidgetType = "textInput"
	Trend          WidgetType = "trend"
)
