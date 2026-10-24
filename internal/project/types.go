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
	Images             []ImageAsset       `json:"images,omitempty"`
	// Human-readable project name
	Name *string `json:"name,omitempty"`
	// Unified Namespace — flat list of folders, assets and tags. Tags with driverId+driverAddr
	// are bound to a live datasource
	Namespace []NamespaceNode `json:"namespace,omitempty"`
	Pages     []Page          `json:"pages"`
	// Operator PIN — operator panel locks behind this if set
	Pin     *string  `json:"pin,omitempty"`
	Recipes []Recipe `json:"recipes,omitempty"`
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
	// May contain {param} placeholders
	Binding        *string          `json:"binding,omitempty"`
	Config         *WidgetConfig    `json:"config,omitempty"`
	Dynamics       []DynamicElement `json:"dynamics,omitempty"`
	GroupID        *string          `json:"groupId,omitempty"`
	H              int64            `json:"h"`
	LocalID        string           `json:"localId"`
	Locked         *bool            `json:"locked,omitempty"`
	Type           WidgetType       `json:"type"`
	VisibleBinding *string          `json:"visibleBinding,omitempty"`
	W              int64            `json:"w"`
	X              int64            `json:"x"`
	Y              int64            `json:"y"`
}

// Per-widget configuration. Fields depend on type.
type WidgetConfig struct {
	Action      *ButtonAction  `json:"action,omitempty"`
	BgColor     *string        `json:"bgColor,omitempty"`
	BorderColor *string        `json:"borderColor,omitempty"`
	BtnColor    *ButtonColor   `json:"btnColor,omitempty"`
	BtnRounded  *ButtonRounded `json:"btnRounded,omitempty"`
	BtnVariant  *ButtonVariant `json:"btnVariant,omitempty"`
	// Tag path for color threshold evaluation
	ColorBinding *string `json:"colorBinding,omitempty"`
	// Color threshold rules applied to colorBinding
	ColorThresholds []Threshold `json:"colorThresholds,omitempty"`
	// Decimal places. Found in existing projects; not read by either app yet
	Decimals *int64 `json:"decimals,omitempty"`
	// Trend history window in seconds
	Duration *int64 `json:"duration,omitempty"`
	// Faceplate widget: id of the faceplate to show
	FaceplateID *string `json:"faceplateId,omitempty"`
	// LED color when false
	FalseColor *string `json:"falseColor,omitempty"`
	// LED text when false
	FalseLabel *string `json:"falseLabel,omitempty"`
	// Image object-fit, as set by the properties panel
	Fit      *ImageFit `json:"fit,omitempty"`
	FontBold *bool     `json:"fontBold,omitempty"`
	// mono | sans | serif; empty means the theme font
	FontFamily *string `json:"fontFamily,omitempty"`
	FontItalic *bool   `json:"fontItalic,omitempty"`
	// xs | sm | base | lg | xl | 2xl | 3xl | 4xl; empty means base
	FontSize      *string `json:"fontSize,omitempty"`
	FontUnderline *bool   `json:"fontUnderline,omitempty"`
	// printf-style format, e.g. '%.2f'
	Format *string `json:"format,omitempty"`
	// Button icon (emoji or short text)
	Icon  *string  `json:"icon,omitempty"`
	Label *string  `json:"label,omitempty"`
	Max   *float64 `json:"max,omitempty"`
	// AlarmBanner max visible rows
	MaxRows *int64   `json:"maxRows,omitempty"`
	Min     *float64 `json:"min,omitempty"`
	// Button: true=momentary, false=toggle
	Momentary *bool `json:"momentary,omitempty"`
	// Button navigate: target page id
	NavigateTo *string `json:"navigateTo,omitempty"`
	NoPadding  *bool   `json:"noPadding,omitempty"`
	// Image object-fit, as set when dropped from the image library
	ObjectFit *ImageFit `json:"objectFit,omitempty"`
	// Button off/release value
	OffValue interface{} `json:"offValue,omitempty"`
	// Button on-press value
	OnValue interface{} `json:"onValue,omitempty"`
	// HistoryLog rows per page
	PageSize *int64 `json:"pageSize,omitempty"`
	// Faceplate widget: parameter name → binding
	Params map[string]string `json:"params,omitempty"`
	// TextInput/NumericInput placeholder
	Placeholder *string `json:"placeholder,omitempty"`
	// Trend horizontal reference lines
	RefLines []RefLine `json:"refLines,omitempty"`
	// Table widget rows
	Rows []TableRow `json:"rows,omitempty"`
	// AlarmBanner: show acknowledged alarms
	ShowAcked *bool `json:"showAcked,omitempty"`
	// Show the tag quality indicator
	ShowQuality *bool `json:"showQuality,omitempty"`
	// Image: data-URL, URL or 'lib:<imageId>'
	Src *string `json:"src,omitempty"`
	// MultiState value→label→color map
	States []StateEntry `json:"states,omitempty"`
	// TextDisplay: fixed text shown instead of a tag value
	StaticText *string `json:"staticText,omitempty"`
	// Setpoint slider step
	Step *float64 `json:"step,omitempty"`
	// Symbol: stroke color
	Stroke *string `json:"stroke,omitempty"`
	// Symbol: id from a symbol pack
	SymbolID *string `json:"symbolId,omitempty"`
	// Trend multi-series config
	Tags       []TrendSeries `json:"tags,omitempty"`
	TextAlign  *TextAlign    `json:"textAlign,omitempty"`
	TextColor  *string       `json:"textColor,omitempty"`
	Thresholds []Threshold   `json:"thresholds,omitempty"`
	// Toggle button color when off
	ToggleOffColor *string `json:"toggleOffColor,omitempty"`
	// Toggle button color when on
	ToggleOnColor *string `json:"toggleOnColor,omitempty"`
	// LED color when true
	TrueColor *string `json:"trueColor,omitempty"`
	// LED text when true
	TrueLabel *string       `json:"trueLabel,omitempty"`
	Unit      *string       `json:"unit,omitempty"`
	XFormat   *TrendXFormat `json:"xFormat,omitempty"`
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

// A dynamic behavior on a widget. Which fields apply depends on kind
type DynamicElement struct {
	ActionType *DynamicActionType `json:"actionType,omitempty"`
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
	MinValue *float64 `json:"minValue,omitempty"`
	// navigate action: target page id
	PageID *string `json:"pageId,omitempty"`
	// incrementValue action: amount to add
	Step       *float64           `json:"step,omitempty"`
	TargetProp *DynamicTargetProp `json:"targetProp,omitempty"`
	// colorFill: color when the tag is truthy
	TrueColor *string `json:"trueColor,omitempty"`
	// script: applied to targetProp when the expression is truthy
	TrueValue *string `json:"trueValue,omitempty"`
	// openUrl action: URL to open
	URL *string `json:"url,omitempty"`
	// Action: binding to write to (may differ from binding)
	WriteTo *string `json:"writeTo,omitempty"`
	// writeValue action: value to write
	WriteValue interface{} `json:"writeValue,omitempty"`
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
	// datasource_id:tag_path, e.g. 'opcua:ns=2;s=PLCnext.iTest'
	Binding  *string          `json:"binding,omitempty"`
	Config   *WidgetConfig    `json:"config,omitempty"`
	Dynamics []DynamicElement `json:"dynamics,omitempty"`
	// IDE-only: widgets with the same groupId move together
	GroupID *string `json:"groupId,omitempty"`
	// Height in grid units
	H  int64  `json:"h"`
	ID string `json:"id"`
	// IDE-only: widget cannot be moved or resized
	Locked *bool      `json:"locked,omitempty"`
	Type   WidgetType `json:"type"`
	// BOOL tag — widget hidden when value is 0/false
	VisibleBinding *string `json:"visibleBinding,omitempty"`
	// Width in grid units
	W int64 `json:"w"`
	// Grid column
	X int64 `json:"x"`
	// Grid row
	Y int64 `json:"y"`
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

type ButtonAction string

const (
	ButtonActionNavigate ButtonAction = "navigate"
	Write                ButtonAction = "write"
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
//
// Image object-fit, as set when dropped from the image library
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

type DynamicActionType string

const (
	DynamicActionTypeNavigate DynamicActionType = "navigate"
	IncrementValue            DynamicActionType = "incrementValue"
	OpenURL                   DynamicActionType = "openUrl"
	ToggleValue               DynamicActionType = "toggleValue"
	WriteValue                DynamicActionType = "writeValue"
)

type DynamicKind string

const (
	Blink      DynamicKind = "blink"
	ColorFill  DynamicKind = "colorFill"
	Disable    DynamicKind = "disable"
	OnClick    DynamicKind = "onClick"
	OnPressed  DynamicKind = "onPressed"
	OnReleased DynamicKind = "onReleased"
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
