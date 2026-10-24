package project

// Speth's Screens project file — single source of truth. Generated types:
// internal/project/types.go + packages/shared-types/src/project.ts
type Types struct {
	AlarmRules       []AlarmRule       `json:"alarmRules,omitempty"`
	Assets           []AssetNode       `json:"assets,omitempty"`
	CanvasResolution *CanvasResolution `json:"canvasResolution,omitempty"`
	CanvasSnap       *CanvasSnap       `json:"canvasSnap,omitempty"`
	Datasources      []Datasource      `json:"datasources"`
	// Symbol pack ids shown in the IDE symbol library. Missing means all packs
	EnabledSymbolPacks []string           `json:"enabledSymbolPacks,omitempty"`
	Faceplates         []FaceplateElement `json:"faceplates,omitempty"`
	// What the historian stores and for how long. Missing means every change, plus one sample
	// per tag every 60 s, kept for the runtime's --history-retention (default 7 days)
	Historian *HistorianSettings `json:"historian,omitempty"`
	Images    []ImageAsset       `json:"images,omitempty"`
	// Human-readable project name
	Name *string `json:"name,omitempty"`
	// Unified Namespace — flat list of folders, assets and tags. Tags with driverId+driverAddr
	// are bound to a live datasource
	Namespace []NamespaceNode `json:"namespace,omitempty"`
	Pages     []Page          `json:"pages"`
	// Operator PIN — operator panel locks behind this if set
	Pin     *string  `json:"pin,omitempty"`
	Recipes []Recipe `json:"recipes,omitempty"`
	// Project file format. A file without it is format 1 and is upgraded when opened
	SchemaVersion int64 `json:"schemaVersion"`
	// Login settings. Missing means mode 'none'. Users live on the runtime (security.db), not
	// in the project
	Security *Security `json:"security,omitempty"`
	// Default theme for every screen. A browser can still pick its own; that choice is not
	// saved in the project
	Theme *ThemeID `json:"theme,omitempty"`
	Udts  []Udt    `json:"udts,omitempty"`
	// Schema version, e.g. '0.1.0'
	Version string `json:"version"`
	// Disable all write widgets in the operator panel
	ViewOnly *bool `json:"viewOnly,omitempty"`
}

type AlarmRule struct {
	// datasource_id:tag_path, e.g. 'opcua:ns=2;s=PLCnext.pressure'
	Binding   string         `json:"binding"`
	Condition AlarmCondition `json:"condition"`
	ID        string         `json:"id"`
	Message   string         `json:"message"`
	Name      string         `json:"name"`
	Severity  AlarmSeverity  `json:"severity"`
	Threshold float64        `json:"threshold"`
}

type AssetNode struct {
	Description *string        `json:"description,omitempty"`
	IconType    *AssetIconType `json:"iconType,omitempty"`
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	ParentID    *string        `json:"parentId,omitempty"`
	TagPrefix   *string        `json:"tagPrefix,omitempty"`
	UdtID       *string        `json:"udtId,omitempty"`
}

// Screen size. 'dynamic' fills the browser window; 'fixed' uses width and height in pixels
type CanvasResolution struct {
	// fixed only
	Height *int64               `json:"height,omitempty"`
	Type   CanvasResolutionType `json:"type"`
	// fixed only
	Width *int64 `json:"width,omitempty"`
}

type Datasource struct {
	Config DatasourceConfig `json:"config"`
	// Unique driver instance ID, e.g. 'opcua', 'mbtcp1'
	ID    string         `json:"id"`
	Label string         `json:"label"`
	Type  DatasourceType `json:"type"`
}

// Driver-specific connection config. Fields used depend on 'type'.
type DatasourceConfig struct {
	// REST base path, e.g. /_pxc_api/v1.14
	BasePath *string `json:"basePath,omitempty"`
	// REST bearer token
	BearerToken *string `json:"bearerToken,omitempty"`
	// How the server's certificate is checked (https REST, ssl MQTT, OPC UA with security).
	// Missing keeps the driver's old behavior: REST off, MQTT trusted, OPC UA off
	CERTCheck *CERTCheck `json:"certCheck,omitempty"`
	// SHA-256 fingerprint of the server certificate, for certCheck 'pinned' (hex, colons
	// optional)
	CERTFingerprint *string `json:"certFingerprint,omitempty"`
	// MQTT client ID
	ClientID *string `json:"clientId,omitempty"`
	// OPC UA: opc.tcp://host:port
	Endpoint *string `json:"endpoint,omitempty"`
	// Modbus/MQTT/REST host
	Host     *string `json:"host,omitempty"`
	Password *string `json:"password,omitempty"`
	// TCP port
	Port           *int64          `json:"port,omitempty"`
	SecurityMode   *SecurityMode   `json:"securityMode,omitempty"`
	SecurityPolicy *SecurityPolicy `json:"securityPolicy,omitempty"`
	// Modbus slave/unit ID
	SlaveID *int64 `json:"slaveId,omitempty"`
	// Virtual driver: JSON-encoded [{path,formula}...] array
	Tags     *string `json:"tags,omitempty"`
	Username *string `json:"username,omitempty"`
}

type FaceplateElement struct {
	Description *string           `json:"description,omitempty"`
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Params      []FaceplateParam  `json:"params"`
	Widgets     []FaceplateWidget `json:"widgets"`
}

type FaceplateParam struct {
	Description *string `json:"description,omitempty"`
	// Used as {name} in bindings inside the faceplate
	Name string `json:"name"`
}

// A widget inside a faceplate. Same as Widget, but identified by localId
type FaceplateWidget struct {
	Bindings *WidgetBindings  `json:"bindings,omitempty"`
	Dynamics []DynamicElement `json:"dynamics,omitempty"`
	Events   *WidgetEvents    `json:"events,omitempty"`
	// IDE-only: widgets with the same groupId move together
	GroupID *string `json:"groupId,omitempty"`
	// Height in grid units
	H       int64  `json:"h"`
	LocalID string `json:"localId"`
	// IDE-only: widget cannot be moved or resized
	Locked *bool `json:"locked,omitempty"`
	// This widget type's settings (see TypedProps)
	Props *FaceplateWidgetProps `json:"props,omitempty"`
	Type  WidgetType            `json:"type"`
	// Width in grid units
	W int64 `json:"w"`
	// Grid column
	X int64 `json:"x"`
	// Grid row
	Y int64 `json:"y"`
}

// The tags a widget reads, by slot. Values are ds:path or ns:path (faceplate widgets may
// use {param})
type WidgetBindings struct {
	// Tag the frame's color thresholds read; missing means the value tag
	Color *string `json:"color,omitempty"`
	// The tag the widget shows or writes
	Value *string `json:"value,omitempty"`
	// BOOL tag: the widget is hidden while it is 0/false
	Visible *string `json:"visible,omitempty"`
}

// A tag-driven look on a widget (actions are events). Which fields apply depends on kind
type DynamicElement struct {
	// Tag the dynamic reacts to
	Binding *string `json:"binding,omitempty"`
	// blink: flash color
	BlinkColor *string `json:"blinkColor,omitempty"`
	// blink: period in milliseconds
	BlinkPeriodMS *int64 `json:"blinkPeriodMs,omitempty"`
	// script: expression evaluated with `value` = tag value, e.g. 'value > 5000'
	Expression *string `json:"expression,omitempty"`
	// colorFill: color when the tag is falsy
	FalseColor *string `json:"falseColor,omitempty"`
	// script: applied to targetProp when the expression is falsy
	FalseValue *string     `json:"falseValue,omitempty"`
	ID         string      `json:"id"`
	Kind       DynamicKind `json:"kind"`
	// rotation: angle in degrees
	MaxAngle *float64 `json:"maxAngle,omitempty"`
	// rotation: tag value mapped to maxAngle
	MaxValue *float64 `json:"maxValue,omitempty"`
	// rotation: angle in degrees
	MinAngle *float64 `json:"minAngle,omitempty"`
	// rotation: tag value mapped to minAngle
	MinValue   *float64           `json:"minValue,omitempty"`
	TargetProp *DynamicTargetProp `json:"targetProp,omitempty"`
	// colorFill: color when the tag is truthy
	TrueColor *string `json:"trueColor,omitempty"`
	// script: applied to targetProp when the expression is truthy
	TrueValue *string `json:"trueValue,omitempty"`
}

// What a widget does when touched. onPress and onRelease write at once (momentary); onClick
// actions may be confirmed
type WidgetEvents struct {
	OnClick   []Action `json:"onClick,omitempty"`
	OnPress   []Action `json:"onPress,omitempty"`
	OnRelease []Action `json:"onRelease,omitempty"`
}

// One thing a widget does when an event happens
type Action struct {
	// toggle: the value written when the tag is on; missing means 0 (false for a bool tag)
	Off interface{} `json:"off,omitempty"`
	// toggle: the value written when the tag is off; missing means 1 (true for a bool tag)
	On interface{} `json:"on,omitempty"`
	// navigate: target page id
	Page *string `json:"page,omitempty"`
	// increment: the amount added; missing means 1
	Step *float64 `json:"step,omitempty"`
	// write, toggle, increment: the tag; missing means the widget's value tag
	Tag  *string    `json:"tag,omitempty"`
	Type ActionType `json:"type"`
	// openUrl: the URL
	URL *string `json:"url,omitempty"`
	// write: the value
	Value interface{} `json:"value,omitempty"`
}

// This widget type's settings (see TypedProps)
//
// # Settings of a gauge widget
//
// Settings of the frame every widget is drawn in. Each widget type's settings include
// these
//
// # Settings of a numericDisplay widget
//
// # Settings of a textDisplay widget
//
// # Settings of a led widget
//
// # Settings of a tank widget
//
// # Settings of a button widget
//
// # Settings of a setpoint widget
//
// # Settings of a multiState widget
//
// # Settings of a trend widget
//
// # Settings of a numericInput widget
//
// # Settings of a textInput widget
//
// # Settings of a historyLog widget
//
// # Settings of a alarmBanner widget
//
// # Settings of a image widget
//
// # Settings of a symbol widget
//
// # Settings of a faceplate widget
//
// Settings of a table widget
type FaceplateWidgetProps struct {
	Max         *float64    `json:"max,omitempty"`
	Min         *float64    `json:"min,omitempty"`
	Thresholds  []Threshold `json:"thresholds,omitempty"`
	Unit        *string     `json:"unit,omitempty"`
	BgColor     *string     `json:"bgColor,omitempty"`
	BorderColor *string     `json:"borderColor,omitempty"`
	// Frame border color rules, applied to the color tag (bindings.color, else the value tag)
	ColorThresholds []Threshold `json:"colorThresholds,omitempty"`
	FontBold        *bool       `json:"fontBold,omitempty"`
	// mono | sans | serif; empty means the theme font
	FontFamily *string `json:"fontFamily,omitempty"`
	FontItalic *bool   `json:"fontItalic,omitempty"`
	// xs | sm | base | lg | xl | 2xl | 3xl | 4xl; empty means base
	FontSize      *string `json:"fontSize,omitempty"`
	FontUnderline *bool   `json:"fontUnderline,omitempty"`
	Label         *string `json:"label,omitempty"`
	NoPadding     *bool   `json:"noPadding,omitempty"`
	// Show the tag quality indicator
	ShowQuality *bool      `json:"showQuality,omitempty"`
	TextAlign   *TextAlign `json:"textAlign,omitempty"`
	TextColor   *string    `json:"textColor,omitempty"`
	// TextDisplay: fixed text shown instead of a tag value
	StaticText *string `json:"staticText,omitempty"`
	// LED color when false
	FalseColor *string `json:"falseColor,omitempty"`
	// LED text when false
	FalseLabel *string `json:"falseLabel,omitempty"`
	// LED color when true
	TrueColor *string `json:"trueColor,omitempty"`
	// LED text when true
	TrueLabel  *string        `json:"trueLabel,omitempty"`
	BtnColor   *ButtonColor   `json:"btnColor,omitempty"`
	BtnRounded *ButtonRounded `json:"btnRounded,omitempty"`
	BtnVariant *ButtonVariant `json:"btnVariant,omitempty"`
	// Button icon (emoji or short text)
	Icon *string `json:"icon,omitempty"`
	// Toggle button color when off
	ToggleOffColor *string `json:"toggleOffColor,omitempty"`
	// Toggle button color when on
	ToggleOnColor *string `json:"toggleOnColor,omitempty"`
	// Setpoint slider step
	Step *float64 `json:"step,omitempty"`
	// MultiState value→label→color map
	States []StateEntry `json:"states,omitempty"`
	// Trend history window in seconds
	Duration *int64 `json:"duration,omitempty"`
	// Trend horizontal reference lines
	RefLines []RefLine `json:"refLines,omitempty"`
	// Trend multi-series config
	Tags    []TrendSeries `json:"tags,omitempty"`
	XFormat *TrendXFormat `json:"xFormat,omitempty"`
	// HistoryLog rows per page
	PageSize *int64 `json:"pageSize,omitempty"`
	// AlarmBanner max visible rows
	MaxRows *int64 `json:"maxRows,omitempty"`
	// AlarmBanner: show acknowledged alarms
	ShowAcked *bool `json:"showAcked,omitempty"`
	// Image object-fit, as set by the properties panel
	Fit *ImageFit `json:"fit,omitempty"`
	// Image: data-URL, URL or 'lib:<imageId>'
	Src *string `json:"src,omitempty"`
	// Symbol: stroke color
	Stroke *string `json:"stroke,omitempty"`
	// Symbol: id from a symbol pack
	SymbolID *string `json:"symbolId,omitempty"`
	// Faceplate widget: id of the faceplate to show
	FaceplateID *string `json:"faceplateId,omitempty"`
	// Faceplate widget: parameter name → binding
	Params map[string]string `json:"params,omitempty"`
	// Table widget rows
	Rows []TableRow `json:"rows,omitempty"`
}

type Threshold struct {
	// CSS color, e.g. '#22c55e'
	Color string `json:"color"`
	// Optional upper bound (exclusive). If set, matches value >= value && value < toValue. If
	// missing, matches value >= value (open-ended, highest match wins)
	ToValue *float64 `json:"toValue,omitempty"`
	Value   float64  `json:"value"`
}

type RefLine struct {
	Color string  `json:"color"`
	Label *string `json:"label,omitempty"`
	Value float64 `json:"value"`
}

type TableRow struct {
	Binding string  `json:"binding"`
	Label   string  `json:"label"`
	Unit    *string `json:"unit,omitempty"`
}

type StateEntry struct {
	Color     string      `json:"color"`
	Label     string      `json:"label"`
	TextColor *string     `json:"textColor,omitempty"`
	Value     interface{} `json:"value"`
}

type TrendSeries struct {
	Binding string   `json:"binding"`
	Color   string   `json:"color"`
	Fill    *bool    `json:"fill,omitempty"`
	Label   *string  `json:"label,omitempty"`
	YMax    *float64 `json:"yMax,omitempty"`
	YMin    *float64 `json:"yMin,omitempty"`
}

// What the historian stores and for how long. Missing means every change, plus one sample
// per tag every 60 s, kept for the runtime's --history-retention (default 7 days)
type HistorianSettings struct {
	// Default deadband in each tag's own units: a number is stored when it moves more than this
	// from the last stored value. 0 stores any change. Text and true/false values ignore it
	Deadband *float64 `json:"deadband,omitempty"`
	// Days of history kept. Overrides the runtime's --history-retention
	RetentionDays *int64 `json:"retentionDays,omitempty"`
	// Rules for single tags or groups; the most specific rule wins
	Tags []HistorianTagRule `json:"tags,omitempty"`
}

type HistorianTagRule struct {
	// Deadband for these tags; missing uses the default
	Deadband *float64 `json:"deadband,omitempty"`
	// Tag as datasource:path, e.g. 'plc1:Arp.Plc.Eclr/rTemp'. Ending in * matches every tag
	// starting with the rest
	Path string `json:"path"`
	// false leaves these tags out of the history (default true)
	Store *bool `json:"store,omitempty"`
}

type ImageAsset struct {
	// base64 data URL
	DataURL  string `json:"dataUrl"`
	Height   int64  `json:"height"`
	ID       string `json:"id"`
	MIMEType string `json:"mimeType"`
	Name     string `json:"name"`
	// Original file size in bytes
	Size  int64 `json:"size"`
	Width int64 `json:"width"`
}

type NamespaceNode struct {
	// float | bool | string | int
	DataType    *string `json:"dataType,omitempty"`
	Description *string `json:"description,omitempty"`
	// Raw driver address of the tag
	DriverAddr *string `json:"driverAddr,omitempty"`
	// Datasource id the tag comes from
	DriverID *string `json:"driverId,omitempty"`
	// virtual nodes: formula
	Expression *string           `json:"expression,omitempty"`
	Meta       map[string]string `json:"meta,omitempty"`
	// Dot-separated path, e.g. 'plant.pump1.running'
	Path string            `json:"path"`
	Type NamespaceNodeType `json:"type"`
	Unit *string           `json:"unit,omitempty"`
}

type Page struct {
	// CSS color for the page background
	BackgroundColor *string `json:"backgroundColor,omitempty"`
	ID              string  `json:"id"`
	Name            string  `json:"name"`
	// Page script (JavaScript source)
	Script  *string  `json:"script,omitempty"`
	Widgets []Widget `json:"widgets"`
}

type Widget struct {
	Bindings *WidgetBindings  `json:"bindings,omitempty"`
	Dynamics []DynamicElement `json:"dynamics,omitempty"`
	Events   *WidgetEvents    `json:"events,omitempty"`
	// IDE-only: widgets with the same groupId move together
	GroupID *string `json:"groupId,omitempty"`
	// Height in grid units
	H  int64  `json:"h"`
	ID string `json:"id"`
	// IDE-only: widget cannot be moved or resized
	Locked *bool `json:"locked,omitempty"`
	// This widget type's settings (see TypedProps)
	Props *WidgetProps `json:"props,omitempty"`
	Type  WidgetType   `json:"type"`
	// Width in grid units
	W int64 `json:"w"`
	// Grid column
	X int64 `json:"x"`
	// Grid row
	Y int64 `json:"y"`
}

// This widget type's settings (see TypedProps)
//
// # Settings of a gauge widget
//
// Settings of the frame every widget is drawn in. Each widget type's settings include
// these
//
// # Settings of a numericDisplay widget
//
// # Settings of a textDisplay widget
//
// # Settings of a led widget
//
// # Settings of a tank widget
//
// # Settings of a button widget
//
// # Settings of a setpoint widget
//
// # Settings of a multiState widget
//
// # Settings of a trend widget
//
// # Settings of a numericInput widget
//
// # Settings of a textInput widget
//
// # Settings of a historyLog widget
//
// # Settings of a alarmBanner widget
//
// # Settings of a image widget
//
// # Settings of a symbol widget
//
// # Settings of a faceplate widget
//
// Settings of a table widget
type WidgetProps struct {
	Max         *float64    `json:"max,omitempty"`
	Min         *float64    `json:"min,omitempty"`
	Thresholds  []Threshold `json:"thresholds,omitempty"`
	Unit        *string     `json:"unit,omitempty"`
	BgColor     *string     `json:"bgColor,omitempty"`
	BorderColor *string     `json:"borderColor,omitempty"`
	// Frame border color rules, applied to the color tag (bindings.color, else the value tag)
	ColorThresholds []Threshold `json:"colorThresholds,omitempty"`
	FontBold        *bool       `json:"fontBold,omitempty"`
	// mono | sans | serif; empty means the theme font
	FontFamily *string `json:"fontFamily,omitempty"`
	FontItalic *bool   `json:"fontItalic,omitempty"`
	// xs | sm | base | lg | xl | 2xl | 3xl | 4xl; empty means base
	FontSize      *string `json:"fontSize,omitempty"`
	FontUnderline *bool   `json:"fontUnderline,omitempty"`
	Label         *string `json:"label,omitempty"`
	NoPadding     *bool   `json:"noPadding,omitempty"`
	// Show the tag quality indicator
	ShowQuality *bool      `json:"showQuality,omitempty"`
	TextAlign   *TextAlign `json:"textAlign,omitempty"`
	TextColor   *string    `json:"textColor,omitempty"`
	// TextDisplay: fixed text shown instead of a tag value
	StaticText *string `json:"staticText,omitempty"`
	// LED color when false
	FalseColor *string `json:"falseColor,omitempty"`
	// LED text when false
	FalseLabel *string `json:"falseLabel,omitempty"`
	// LED color when true
	TrueColor *string `json:"trueColor,omitempty"`
	// LED text when true
	TrueLabel  *string        `json:"trueLabel,omitempty"`
	BtnColor   *ButtonColor   `json:"btnColor,omitempty"`
	BtnRounded *ButtonRounded `json:"btnRounded,omitempty"`
	BtnVariant *ButtonVariant `json:"btnVariant,omitempty"`
	// Button icon (emoji or short text)
	Icon *string `json:"icon,omitempty"`
	// Toggle button color when off
	ToggleOffColor *string `json:"toggleOffColor,omitempty"`
	// Toggle button color when on
	ToggleOnColor *string `json:"toggleOnColor,omitempty"`
	// Setpoint slider step
	Step *float64 `json:"step,omitempty"`
	// MultiState value→label→color map
	States []StateEntry `json:"states,omitempty"`
	// Trend history window in seconds
	Duration *int64 `json:"duration,omitempty"`
	// Trend horizontal reference lines
	RefLines []RefLine `json:"refLines,omitempty"`
	// Trend multi-series config
	Tags    []TrendSeries `json:"tags,omitempty"`
	XFormat *TrendXFormat `json:"xFormat,omitempty"`
	// HistoryLog rows per page
	PageSize *int64 `json:"pageSize,omitempty"`
	// AlarmBanner max visible rows
	MaxRows *int64 `json:"maxRows,omitempty"`
	// AlarmBanner: show acknowledged alarms
	ShowAcked *bool `json:"showAcked,omitempty"`
	// Image object-fit, as set by the properties panel
	Fit *ImageFit `json:"fit,omitempty"`
	// Image: data-URL, URL or 'lib:<imageId>'
	Src *string `json:"src,omitempty"`
	// Symbol: stroke color
	Stroke *string `json:"stroke,omitempty"`
	// Symbol: id from a symbol pack
	SymbolID *string `json:"symbolId,omitempty"`
	// Faceplate widget: id of the faceplate to show
	FaceplateID *string `json:"faceplateId,omitempty"`
	// Faceplate widget: parameter name → binding
	Params map[string]string `json:"params,omitempty"`
	// Table widget rows
	Rows []TableRow `json:"rows,omitempty"`
}

type Recipe struct {
	Description *string       `json:"description,omitempty"`
	Entries     []RecipeEntry `json:"entries"`
	ID          string        `json:"id"`
	Name        string        `json:"name"`
}

type RecipeEntry struct {
	// datasource_id:tag_path
	Binding string      `json:"binding"`
	Value   interface{} `json:"value"`
}

// Login settings. Missing means mode 'none'. Users live on the runtime (security.db), not
// in the project
type Security struct {
	Mode AuthMode `json:"mode"`
}

type Udt struct {
	Description *string    `json:"description,omitempty"`
	Fields      []UDTField `json:"fields"`
	ID          string     `json:"id"`
	Name        string     `json:"name"`
}

type UDTField struct {
	Description *string      `json:"description,omitempty"`
	Name        string       `json:"name"`
	Type        UDTFieldType `json:"type"`
	Unit        *string      `json:"unit,omitempty"`
}

type AlarmCondition string

const (
	Eq  AlarmCondition = "eq"
	Gt  AlarmCondition = "gt"
	Gte AlarmCondition = "gte"
	LTE AlarmCondition = "lte"
	Lt  AlarmCondition = "lt"
	Ne  AlarmCondition = "ne"
)

type AlarmSeverity string

const (
	Critical AlarmSeverity = "critical"
	Info     AlarmSeverity = "info"
	Warning  AlarmSeverity = "warning"
)

type AssetIconType string

const (
	Area   AssetIconType = "area"
	Device AssetIconType = "device"
	Plant  AssetIconType = "plant"
	Sensor AssetIconType = "sensor"
	Unit   AssetIconType = "unit"
)

type CanvasResolutionType string

const (
	Dynamic CanvasResolutionType = "dynamic"
	Fixed   CanvasResolutionType = "fixed"
)

type CanvasSnap string

const (
	Grid  CanvasSnap = "grid"
	Pixel CanvasSnap = "pixel"
)

// How the server's certificate is checked (https REST, ssl MQTT, OPC UA with security).
// Missing keeps the driver's old behavior: REST off, MQTT trusted, OPC UA off
//
// off: accept any certificate; pinned: only the one with certFingerprint; trusted:
// certificates the system trusts
type CERTCheck string

const (
	Off     CERTCheck = "off"
	Pinned  CERTCheck = "pinned"
	Trusted CERTCheck = "trusted"
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
	DatasourceTypeVirtual DatasourceType = "virtual"
	Mbtcp                 DatasourceType = "mbtcp"
	Mqtt                  DatasourceType = "mqtt"
	Opcua                 DatasourceType = "opcua"
	REST                  DatasourceType = "rest"
)

type DynamicKind string

const (
	Blink      DynamicKind = "blink"
	ColorFill  DynamicKind = "colorFill"
	Disable    DynamicKind = "disable"
	Rotation   DynamicKind = "rotation"
	Script     DynamicKind = "script"
	Visibility DynamicKind = "visibility"
)

type DynamicTargetProp string

const (
	BgColor     DynamicTargetProp = "bgColor"
	BorderColor DynamicTargetProp = "borderColor"
	TextColor   DynamicTargetProp = "textColor"
	Visible     DynamicTargetProp = "visible"
)

type ActionType string

const (
	Increment ActionType = "increment"
	Navigate  ActionType = "navigate"
	OpenURL   ActionType = "openUrl"
	Toggle    ActionType = "toggle"
	Write     ActionType = "write"
)

type ButtonColor string

const (
	Amber  ButtonColor = "amber"
	Blue   ButtonColor = "blue"
	Green  ButtonColor = "green"
	Orange ButtonColor = "orange"
	Purple ButtonColor = "purple"
	Red    ButtonColor = "red"
	White  ButtonColor = "white"
	Zinc   ButtonColor = "zinc"
)

type ButtonRounded string

const (
	ButtonRoundedNone ButtonRounded = "none"
	Full              ButtonRounded = "full"
	Lg                ButtonRounded = "lg"
	Md                ButtonRounded = "md"
	Sm                ButtonRounded = "sm"
)

type ButtonVariant string

const (
	Filled     ButtonVariant = "filled"
	Flat       ButtonVariant = "flat"
	Ghost      ButtonVariant = "ghost"
	Industrial ButtonVariant = "industrial"
	Outlined   ButtonVariant = "outlined"
)

// Image object-fit, as set by the properties panel
type ImageFit string

const (
	Contain ImageFit = "contain"
	Cover   ImageFit = "cover"
	Fill    ImageFit = "fill"
)

type TextAlign string

const (
	Center TextAlign = "center"
	Left   TextAlign = "left"
	Right  TextAlign = "right"
)

// Trend X-axis label format
type TrendXFormat string

const (
	Datetime  TrendXFormat = "datetime"
	Relative  TrendXFormat = "relative"
	Time      TrendXFormat = "time"
	TimeShort TrendXFormat = "time-short"
)

type WidgetType string

const (
	AlarmBanner    WidgetType = "alarmBanner"
	Button         WidgetType = "button"
	Faceplate      WidgetType = "faceplate"
	Gauge          WidgetType = "gauge"
	HistoryLog     WidgetType = "historyLog"
	Image          WidgetType = "image"
	LED            WidgetType = "led"
	MultiState     WidgetType = "multiState"
	NumericDisplay WidgetType = "numericDisplay"
	NumericInput   WidgetType = "numericInput"
	Setpoint       WidgetType = "setpoint"
	Symbol         WidgetType = "symbol"
	Table          WidgetType = "table"
	Tank           WidgetType = "tank"
	TextDisplay    WidgetType = "textDisplay"
	TextInput      WidgetType = "textInput"
	Trend          WidgetType = "trend"
)

type NamespaceNodeType string

const (
	Asset                    NamespaceNodeType = "asset"
	Folder                   NamespaceNodeType = "folder"
	NamespaceNodeTypeVirtual NamespaceNodeType = "virtual"
	Tag                      NamespaceNodeType = "tag"
)

// none: no login, anyone who reaches the runtime can read and write. login: every user must
// log in
type AuthMode string

const (
	AuthModeNone AuthMode = "none"
	Login        AuthMode = "login"
)

// Default theme for every screen. A browser can still pick its own; that choice is not
// saved in the project
type ThemeID string

const (
	Blueprint        ThemeID = "blueprint"
	Brutalist        ThemeID = "brutalist"
	CleanRoom        ThemeID = "clean-room"
	EngineeringPaper ThemeID = "engineering-paper"
	Holographic      ThemeID = "holographic"
	SCADADark        ThemeID = "scada-dark"
)

type UDTFieldType string

const (
	Bool   UDTFieldType = "bool"
	Int    UDTFieldType = "int"
	Real   UDTFieldType = "real"
	String UDTFieldType = "string"
)
