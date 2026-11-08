package project

// Speth's Screens project file — single source of truth. Generated types:
// internal/project/types.go + packages/shared-types/src/project.ts
type Types struct {
	AlarmRules       []AlarmRule           `json:"alarmRules,omitempty"`
	Assets           []AssetNode           `json:"assets,omitempty"`
	CanvasResolution *CanvasResolution     `json:"canvasResolution,omitempty"`
	CanvasSnap       *CanvasSnap           `json:"canvasSnap,omitempty"`
	CustomWidgets    []CustomWidgetElement `json:"customWidgets,omitempty"`
	Datasources      []Datasource          `json:"datasources"`
	// Symbol pack ids shown in the IDE symbol library. Missing means all packs
	EnabledSymbolPacks []string `json:"enabledSymbolPacks,omitempty"`
	// What the historian stores and for how long. Missing means every change, plus one sample
	// per tag every 60 s, kept for the runtime's --history-retention (default 7 days)
	Historian *HistorianSettings `json:"historian,omitempty"`
	Images    []ImageAsset       `json:"images,omitempty"`
	// Language codes the screens can be shown in, such as en, de, es. The first is the language
	// the project's text is written in; the operator screen offers a switch when there are two
	// or more
	Languages []string `json:"languages,omitempty"`
	// Human-readable project name
	Name *string `json:"name,omitempty"`
	// Unified Namespace — flat list of folders, assets and tags. Tags with driverId+driverAddr
	// are bound to a live datasource
	Namespace []NamespaceNode `json:"namespace,omitempty"`
	Pages     []Page          `json:"pages"`
	// Operator PIN — operator panel locks behind this if set
	Pin *string `json:"pin,omitempty"`
	// Widget presets: set-up widgets saved for reuse. Inserting one copies its widgets onto a
	// page with new ids; nothing links back to the preset. The runtime ignores presets.
	Presets []Preset `json:"presets,omitempty"`
	Recipes []Recipe `json:"recipes,omitempty"`
	// Project file format. A file without it is format 1 and is upgraded when opened
	SchemaVersion int64 `json:"schemaVersion"`
	// The role runtime scripts write as (roles and limits apply, and the audit names the
	// script); missing means operator
	ScriptRole *Role `json:"scriptRole,omitempty"`
	// Runtime scripts: JavaScript the runtime runs on its own (goja), on the triggers each one
	// names
	Scripts []RuntimeScript `json:"scripts,omitempty"`
	// Login settings. Missing means mode 'none'. Users live on the runtime (security.db), not
	// in the project
	Security *Security `json:"security,omitempty"`
	// Variables kept per browser tab, read as {session:name}; they never reach the runtime
	SessionVars []SessionVar `json:"sessionVars,omitempty"`
	Shell       *Shell       `json:"shell,omitempty"`
	// The look of every screen: a preset, light or dark, and any element changed from the
	// preset. A browser can still pick light or dark for itself; that choice is not saved in
	// the project
	Theme *Theme `json:"theme,omitempty"`
	// For each language, the project's text as written (page names, labels, alarm messages)
	// mapped to its translation. A text with no entry shows as written
	Translations map[string]map[string]string `json:"translations,omitempty"`
	Udts         []Udt                        `json:"udts,omitempty"`
	// Schema version, e.g. '0.1.0'
	Version string `json:"version"`
	// Disable all write widgets in the operator panel
	ViewOnly *bool `json:"viewOnly,omitempty"`
}

type AlarmRule struct {
	// Expression (the Speth's Screens expression language): the alarm is active while it is
	// true, e.g. {ns:Tank1/Level} > 95 && {ns:Tank1/InletOpen}. While an input it needs is Bad
	// or missing, the alarm stays as it is
	Expr     string        `json:"expr"`
	ID       string        `json:"id"`
	Message  string        `json:"message"`
	Name     string        `json:"name"`
	Severity AlarmSeverity `json:"severity"`
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

type CustomWidgetElement struct {
	Description *string `json:"description,omitempty"`
	ID          string  `json:"id"`
	// How the parts are placed; missing means free (each at its own x, y, w, h)
	Layout  *CustomWidgetLayout `json:"layout,omitempty"`
	Name    string              `json:"name"`
	Params  []CustomWidgetParam `json:"params"`
	Widgets []CustomWidgetPart  `json:"widgets"`
}

// How the parts are placed; missing means free (each at its own x, y, w, h)
//
// How a custom widget places its parts. In a stack the parts follow each other in a row or
// a column and share the room by their flex settings; tablet and phone replace any field
// for that screen size
type CustomWidgetLayout struct {
	// Across the direction
	Align     *Align     `json:"align,omitempty"`
	Direction *Direction `json:"direction,omitempty"`
	// Pixels between parts
	Gap *int64 `json:"gap,omitempty"`
	// Along the direction
	Justify *Justify `json:"justify,omitempty"`
	// free: each part at its own place; stack: parts follow each other
	Mode *Mode `json:"mode,omitempty"`
	// Pixels around the parts
	Padding *int64                      `json:"padding,omitempty"`
	Phone   *CustomWidgetLayoutOverride `json:"phone,omitempty"`
	Tablet  *CustomWidgetLayoutOverride `json:"tablet,omitempty"`
	// Parts that do not fit start a new line
	Wrap *bool `json:"wrap,omitempty"`
}

// The stack settings that differ on a smaller screen; a phone inherits from the tablet and
// the tablet from the desktop
type CustomWidgetLayoutOverride struct {
	Align     *Align     `json:"align,omitempty"`
	Direction *Direction `json:"direction,omitempty"`
	Gap       *int64     `json:"gap,omitempty"`
	Justify   *Justify   `json:"justify,omitempty"`
	Padding   *int64     `json:"padding,omitempty"`
	Wrap      *bool      `json:"wrap,omitempty"`
}

type CustomWidgetParam struct {
	Description *string `json:"description,omitempty"`
	// Used as {name} in bindings inside the custom widget
	Name string `json:"name"`
}

// A widget inside a custom widget. Same as Widget, but identified by localId, and it may
// say how it is laid out in a stack (flex, hiddenOn)
type CustomWidgetPart struct {
	Bindings *WidgetBindings `json:"bindings,omitempty"`
	// Driven properties, by property name; which names a widget type has is listed in TypedProps
	Dynamics map[string]Drive `json:"dynamics,omitempty"`
	Events   *WidgetEvents    `json:"events,omitempty"`
	Flex     *PartFlex        `json:"flex,omitempty"`
	// IDE-only: widgets with the same groupId move together
	GroupID *string `json:"groupId,omitempty"`
	// Height in grid units
	H int64 `json:"h"`
	// Screen sizes this part is left out of
	HiddenOn []HiddenOn `json:"hiddenOn,omitempty"`
	LocalID  string     `json:"localId"`
	// IDE-only: widget cannot be moved or resized
	Locked *bool `json:"locked,omitempty"`
	// This widget type's settings (see TypedProps)
	Props *CustomWidgetPartProps `json:"props,omitempty"`
	Type  WidgetType             `json:"type"`
	// Width in grid units
	W int64 `json:"w"`
	// Grid column
	X int64 `json:"x"`
	// Grid row
	Y int64 `json:"y"`
}

// The tags a widget reads, by slot. Values are ds:path or ns:path (widgets inside a custom
// widget may use {param})
type WidgetBindings struct {
	// Tag the frame's color thresholds read; missing means the value tag
	Color *string `json:"color,omitempty"`
	// The tag the widget shows or writes
	Value *string `json:"value,omitempty"`
	// BOOL tag: the widget is hidden while it is 0/false
	Visible *string `json:"visible,omitempty"`
}

// Drives one property of a widget: the expression's value, through the transform if there
// is one. An unknown result, or a value of the wrong type for the property, leaves the
// property's own setting
type Drive struct {
	// Expression (the Speth's Screens expression language); value is the widget's value tag
	Expr      string     `json:"expr"`
	Transform *Transform `json:"transform,omitempty"`
}

// Turns an expression value into a property value. linear: scale in to out; thresholds: the
// value of the last step whose above the value reaches; map: the value of the case it equals
type Transform struct {
	// thresholds: the value under the first step; missing leaves the property's own setting
	Below *TransformValue `json:"below,omitempty"`
	// map: the cases, first match wins
	Cases []MapCase `json:"cases,omitempty"`
	// linear: keep the result inside out; missing means true
	Clamp *bool `json:"clamp,omitempty"`
	// map: the value when no case matches; missing leaves the property's own setting
	Default *TransformValue `json:"default,omitempty"`
	// linear: input range [low, high]
	In   []float64     `json:"in,omitempty"`
	Kind TransformKind `json:"kind"`
	// linear: output range [low, high]
	Out []float64 `json:"out,omitempty"`
	// thresholds: steps in ascending order of above
	Steps []ThresholdStep `json:"steps,omitempty"`
}

type MapCase struct {
	Equals *TransformValue `json:"equals"`
	Value  *TransformValue `json:"value"`
}

type ThresholdStep struct {
	Above float64         `json:"above"`
	Value *TransformValue `json:"value"`
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

// How a part takes room in a stack; a part with no flex keeps the size it has in the layout
// (w and h as grid units)
type PartFlex struct {
	// Size along the direction in pixels; 0 or missing fits the content
	Basis *int64 `json:"basis,omitempty"`
	// Share of the free room; 0 keeps the part at its basis
	Grow   *float64          `json:"grow,omitempty"`
	Phone  *PartFlexOverride `json:"phone,omitempty"`
	Tablet *PartFlexOverride `json:"tablet,omitempty"`
}

// What differs on a smaller screen; a phone inherits from the tablet and the tablet from
// the desktop
type PartFlexOverride struct {
	Basis *int64   `json:"basis,omitempty"`
	Grow  *float64 `json:"grow,omitempty"`
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
// Settings of a pipe widget: a line through points with an animated flow
//
// # Settings of a custom widget placement
//
// Settings of a page list widget: the project's pages as navigation, the open one
// highlighted
//
// Settings of a clock widget: the time in the operator's browser
//
// Settings of a driver status widget: whether each datasource is connected
//
// Settings of a user menu widget: who is signed in, and signing in or out
//
// Settings of a recipes widget: the project's recipes, each with a button that writes its
// values
//
// Settings of a table widget
type CustomWidgetPartProps struct {
	Max        *float64    `json:"max,omitempty"`
	Min        *float64    `json:"min,omitempty"`
	Thresholds []Threshold `json:"thresholds,omitempty"`
	Unit       *string     `json:"unit,omitempty"`
	BgColor    *string     `json:"bgColor,omitempty"`
	// Color the frame flashes while blinking; missing means the widget fades in and out
	BlinkColor *string `json:"blinkColor,omitempty"`
	// Blink period in milliseconds while dynamics.blink is on; missing means 800
	BlinkPeriodMS *int64  `json:"blinkPeriodMs,omitempty"`
	BorderColor   *string `json:"borderColor,omitempty"`
	// Border width in pixels; missing means the theme's
	BorderWidth *float64 `json:"borderWidth,omitempty"`
	// Frame border color rules, applied to the color tag (bindings.color, else the value tag)
	ColorThresholds []Threshold `json:"colorThresholds,omitempty"`
	FontBold        *bool       `json:"fontBold,omitempty"`
	// mono | sans | serif; empty means the theme font
	FontFamily *string `json:"fontFamily,omitempty"`
	FontItalic *bool   `json:"fontItalic,omitempty"`
	// Exact text size in pixels; overrides fontSize
	FontPx *float64 `json:"fontPx,omitempty"`
	// xs | sm | base | lg | xl | 2xl | 3xl | 4xl | 5xl | 6xl, or fit (the text grows to fill
	// the card); empty means the widget's own size
	FontSize      *string `json:"fontSize,omitempty"`
	FontUnderline *bool   `json:"fontUnderline,omitempty"`
	Label         *string `json:"label,omitempty"`
	NoPadding     *bool   `json:"noPadding,omitempty"`
	// Space inside the card in pixels; overrides noPadding and the theme
	Padding *float64 `json:"padding,omitempty"`
	// Corner radius in pixels; missing means the theme's
	Radius *float64 `json:"radius,omitempty"`
	// false removes the card's shadow; missing means the theme's
	Shadow *bool `json:"shadow,omitempty"`
	// false hides the label above the value; missing means shown
	ShowLabel *bool `json:"showLabel,omitempty"`
	// Show the tag quality indicator
	ShowQuality *bool `json:"showQuality,omitempty"`
	// false hides the unit beside the value; missing means shown
	ShowUnit  *bool      `json:"showUnit,omitempty"`
	TextAlign *TextAlign `json:"textAlign,omitempty"`
	TextColor *string    `json:"textColor,omitempty"`
	// top | center | bottom: where the value sits in the card; missing means center
	Valign *string `json:"valign,omitempty"`
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
	// fit (follow the visible data) | nice (follow it, rounded to tidy numbers) | fixed (use
	// min and max, or each pen's yMin and yMax); missing means fit when no limits are set, else
	// fixed
	Autoscale *string `json:"autoscale,omitempty"`
	// Trend history window in seconds
	Duration *int64 `json:"duration,omitempty"`
	// false starts the trend paused; missing means running
	Live *bool `json:"live,omitempty"`
	// Trend horizontal reference lines
	RefLines []RefLine `json:"refLines,omitempty"`
	// Missing means shown
	ShowGrid *bool `json:"showGrid,omitempty"`
	// Missing means shown
	ShowLegend *bool `json:"showLegend,omitempty"`
	// Window, pause and history buttons; missing means shown
	ShowToolbar *bool `json:"showToolbar,omitempty"`
	// Trend multi-series config
	Tags []TrendSeries `json:"tags,omitempty"`
	// Seconds of each window button; missing means 30, 60, 300 and 3600
	Windows []int64       `json:"windows,omitempty"`
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
	// Symbol: true while the symbol should move (a pump running); drive it from a tag
	Animate *bool `json:"animate,omitempty"`
	// Symbol: seconds for one turn or one pulse; missing means 2
	//
	// Pipe: seconds for the dashes to move one step; missing means 1
	CycleSeconds *float64 `json:"cycleSeconds,omitempty"`
	// Symbol: what it does while animate is true
	Motion *SymbolMotion `json:"motion,omitempty"`
	// Symbol: stroke color
	Stroke *string `json:"stroke,omitempty"`
	// Symbol: id from a symbol pack
	SymbolID *string `json:"symbolId,omitempty"`
	// Pipe: the pipe's color, a CSS color or a token such as token:process-running
	Color *string `json:"color,omitempty"`
	// Pipe: true while something flows; drive it from a tag
	Flow *bool `json:"flow,omitempty"`
	// Pipe: the color of the moving dashes; missing means the theme's own
	FlowColor *string `json:"flowColor,omitempty"`
	// Pipe: the corners as x,y pairs from 0 to 100 across the widget, e.g. "0,50 60,50 60,100"
	Points *string `json:"points,omitempty"`
	// Pipe: flow runs from the last point to the first
	Reverse *bool `json:"reverse,omitempty"`
	// Pipe: line width in pixels; missing means 8
	Weight *float64 `json:"weight,omitempty"`
	// Custom widget: id of the custom widget to show
	CustomWidgetID *string `json:"customWidgetId,omitempty"`
	// Custom widget: parameter name → binding
	Params map[string]string `json:"params,omitempty"`
	// list: show each page group's heading (default true)
	ShowGroups *bool `json:"showGroups,omitempty"`
	// list: icon and name down the side, grouped; tabs: names in a row; icons: large icon
	// buttons in a row; bar: icon over name, sharing the width
	Style *Style `json:"style,omitempty"`
	// What to show; missing means timeSeconds
	Format *Format `json:"format,omitempty"`
	// 12-hour clock instead of 24-hour
	Hour12 *bool `json:"hour12,omitempty"`
	// Put the weekday first (default true)
	ShowWeekday *bool `json:"showWeekday,omitempty"`
	// One summary (2/3) instead of a chip for each datasource
	Compact *bool `json:"compact,omitempty"`
	// Show the signed-in name beside the icon
	ShowName *bool `json:"showName,omitempty"`
	// Show only this recipe; missing shows every recipe
	RecipeID *string `json:"recipeId,omitempty"`
	// List each recipe's tags and values (default true)
	ShowEntries *bool `json:"showEntries,omitempty"`
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
	// own | shared: shared pens use one Y scale (the first shared pen's); missing means own
	Axis    *string `json:"axis,omitempty"`
	Binding string  `json:"binding"`
	Color   string  `json:"color"`
	// solid | dashed | dotted; missing means solid
	Dash  *string `json:"dash,omitempty"`
	Fill  *bool   `json:"fill,omitempty"`
	Label *string `json:"label,omitempty"`
	// line | step | area | dots | bars; missing means line
	Style *string `json:"style,omitempty"`
	// Pen width in pixels; missing means 1.5
	Width *float64 `json:"width,omitempty"`
	YMax  *float64 `json:"yMax,omitempty"`
	YMin  *float64 `json:"yMin,omitempty"`
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
	Host *string `json:"host,omitempty"`
	// Memory datasource: the typed tags it holds
	MemoryTags []MemoryTag `json:"memoryTags,omitempty"`
	Password   *string     `json:"password,omitempty"`
	// TCP port
	Port           *int64          `json:"port,omitempty"`
	SecurityMode   *SecurityMode   `json:"securityMode,omitempty"`
	SecurityPolicy *SecurityPolicy `json:"securityPolicy,omitempty"`
	// Modbus slave/unit ID
	SlaveID *int64 `json:"slaveId,omitempty"`
	// Virtual driver: the calculated tags
	Tags     []CalculatedTag `json:"tags,omitempty"`
	Username *string         `json:"username,omitempty"`
}

// A typed value the runtime holds; other expressions read it as {datasource:path}
type MemoryTag struct {
	// The value before anything is written (and after a restart, unless retained); missing
	// means false, 0 or empty text
	Initial *TransformValue `json:"initial,omitempty"`
	// The tag's name in this datasource
	Path string `json:"path"`
	// Keep the last value across a runtime restart
	Retain *bool `json:"retain,omitempty"`
	Type   Type  `json:"type"`
}

// A tag the virtual driver computes. Other expressions read it as {datasource:path}
type CalculatedTag struct {
	// Expression giving its value, e.g. clamp({mb:AI0} / 4095 * 100, 0, 100). A Bad or missing
	// input makes the tag Bad
	Expr string `json:"expr"`
	// The tag's name in this datasource
	Path string `json:"path"`
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
	// Pages with the same group are listed together under that heading in the sidebar
	Group *string `json:"group,omitempty"`
	// Shown beside the page's name in the navigation; missing shows the name's first letter
	Icon *PageIcon `json:"icon,omitempty"`
	ID   string    `json:"id"`
	Name string    `json:"name"`
	// Page script (JavaScript source)
	Script  *string  `json:"script,omitempty"`
	Widgets []Widget `json:"widgets"`
}

type Widget struct {
	Bindings *WidgetBindings `json:"bindings,omitempty"`
	// Driven properties, by property name; which names a widget type has is listed in TypedProps
	Dynamics map[string]Drive `json:"dynamics,omitempty"`
	Events   *WidgetEvents    `json:"events,omitempty"`
	// IDE-only: widgets with the same groupId move together
	GroupID *string `json:"groupId,omitempty"`
	// Height in grid units
	H      int64          `json:"h"`
	ID     string         `json:"id"`
	Layout *WidgetLayouts `json:"layout,omitempty"`
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

// Where the widget sits on a smaller screen. x, y, w and h above are the desktop layout; a
// tablet (under 1024 px wide) uses what is set here, and a phone (under 640 px) uses its
// own, then the tablet's, then the desktop's, one field at a time
type WidgetLayouts struct {
	Phone  *WidgetPlacement `json:"phone,omitempty"`
	Tablet *WidgetPlacement `json:"tablet,omitempty"`
}

// A widget's place on one screen size; a field left out is inherited from the next size up
type WidgetPlacement struct {
	// Height
	H *int64 `json:"h,omitempty"`
	// Not shown on this screen size
	Hidden *bool `json:"hidden,omitempty"`
	// Width
	W *int64 `json:"w,omitempty"`
	// Grid column or pixel
	X *int64 `json:"x,omitempty"`
	// Grid row or pixel
	Y *int64 `json:"y,omitempty"`
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
// Settings of a pipe widget: a line through points with an animated flow
//
// # Settings of a custom widget placement
//
// Settings of a page list widget: the project's pages as navigation, the open one
// highlighted
//
// Settings of a clock widget: the time in the operator's browser
//
// Settings of a driver status widget: whether each datasource is connected
//
// Settings of a user menu widget: who is signed in, and signing in or out
//
// Settings of a recipes widget: the project's recipes, each with a button that writes its
// values
//
// Settings of a table widget
type WidgetProps struct {
	Max        *float64    `json:"max,omitempty"`
	Min        *float64    `json:"min,omitempty"`
	Thresholds []Threshold `json:"thresholds,omitempty"`
	Unit       *string     `json:"unit,omitempty"`
	BgColor    *string     `json:"bgColor,omitempty"`
	// Color the frame flashes while blinking; missing means the widget fades in and out
	BlinkColor *string `json:"blinkColor,omitempty"`
	// Blink period in milliseconds while dynamics.blink is on; missing means 800
	BlinkPeriodMS *int64  `json:"blinkPeriodMs,omitempty"`
	BorderColor   *string `json:"borderColor,omitempty"`
	// Border width in pixels; missing means the theme's
	BorderWidth *float64 `json:"borderWidth,omitempty"`
	// Frame border color rules, applied to the color tag (bindings.color, else the value tag)
	ColorThresholds []Threshold `json:"colorThresholds,omitempty"`
	FontBold        *bool       `json:"fontBold,omitempty"`
	// mono | sans | serif; empty means the theme font
	FontFamily *string `json:"fontFamily,omitempty"`
	FontItalic *bool   `json:"fontItalic,omitempty"`
	// Exact text size in pixels; overrides fontSize
	FontPx *float64 `json:"fontPx,omitempty"`
	// xs | sm | base | lg | xl | 2xl | 3xl | 4xl | 5xl | 6xl, or fit (the text grows to fill
	// the card); empty means the widget's own size
	FontSize      *string `json:"fontSize,omitempty"`
	FontUnderline *bool   `json:"fontUnderline,omitempty"`
	Label         *string `json:"label,omitempty"`
	NoPadding     *bool   `json:"noPadding,omitempty"`
	// Space inside the card in pixels; overrides noPadding and the theme
	Padding *float64 `json:"padding,omitempty"`
	// Corner radius in pixels; missing means the theme's
	Radius *float64 `json:"radius,omitempty"`
	// false removes the card's shadow; missing means the theme's
	Shadow *bool `json:"shadow,omitempty"`
	// false hides the label above the value; missing means shown
	ShowLabel *bool `json:"showLabel,omitempty"`
	// Show the tag quality indicator
	ShowQuality *bool `json:"showQuality,omitempty"`
	// false hides the unit beside the value; missing means shown
	ShowUnit  *bool      `json:"showUnit,omitempty"`
	TextAlign *TextAlign `json:"textAlign,omitempty"`
	TextColor *string    `json:"textColor,omitempty"`
	// top | center | bottom: where the value sits in the card; missing means center
	Valign *string `json:"valign,omitempty"`
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
	// fit (follow the visible data) | nice (follow it, rounded to tidy numbers) | fixed (use
	// min and max, or each pen's yMin and yMax); missing means fit when no limits are set, else
	// fixed
	Autoscale *string `json:"autoscale,omitempty"`
	// Trend history window in seconds
	Duration *int64 `json:"duration,omitempty"`
	// false starts the trend paused; missing means running
	Live *bool `json:"live,omitempty"`
	// Trend horizontal reference lines
	RefLines []RefLine `json:"refLines,omitempty"`
	// Missing means shown
	ShowGrid *bool `json:"showGrid,omitempty"`
	// Missing means shown
	ShowLegend *bool `json:"showLegend,omitempty"`
	// Window, pause and history buttons; missing means shown
	ShowToolbar *bool `json:"showToolbar,omitempty"`
	// Trend multi-series config
	Tags []TrendSeries `json:"tags,omitempty"`
	// Seconds of each window button; missing means 30, 60, 300 and 3600
	Windows []int64       `json:"windows,omitempty"`
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
	// Symbol: true while the symbol should move (a pump running); drive it from a tag
	Animate *bool `json:"animate,omitempty"`
	// Symbol: seconds for one turn or one pulse; missing means 2
	//
	// Pipe: seconds for the dashes to move one step; missing means 1
	CycleSeconds *float64 `json:"cycleSeconds,omitempty"`
	// Symbol: what it does while animate is true
	Motion *SymbolMotion `json:"motion,omitempty"`
	// Symbol: stroke color
	Stroke *string `json:"stroke,omitempty"`
	// Symbol: id from a symbol pack
	SymbolID *string `json:"symbolId,omitempty"`
	// Pipe: the pipe's color, a CSS color or a token such as token:process-running
	Color *string `json:"color,omitempty"`
	// Pipe: true while something flows; drive it from a tag
	Flow *bool `json:"flow,omitempty"`
	// Pipe: the color of the moving dashes; missing means the theme's own
	FlowColor *string `json:"flowColor,omitempty"`
	// Pipe: the corners as x,y pairs from 0 to 100 across the widget, e.g. "0,50 60,50 60,100"
	Points *string `json:"points,omitempty"`
	// Pipe: flow runs from the last point to the first
	Reverse *bool `json:"reverse,omitempty"`
	// Pipe: line width in pixels; missing means 8
	Weight *float64 `json:"weight,omitempty"`
	// Custom widget: id of the custom widget to show
	CustomWidgetID *string `json:"customWidgetId,omitempty"`
	// Custom widget: parameter name → binding
	Params map[string]string `json:"params,omitempty"`
	// list: show each page group's heading (default true)
	ShowGroups *bool `json:"showGroups,omitempty"`
	// list: icon and name down the side, grouped; tabs: names in a row; icons: large icon
	// buttons in a row; bar: icon over name, sharing the width
	Style *Style `json:"style,omitempty"`
	// What to show; missing means timeSeconds
	Format *Format `json:"format,omitempty"`
	// 12-hour clock instead of 24-hour
	Hour12 *bool `json:"hour12,omitempty"`
	// Put the weekday first (default true)
	ShowWeekday *bool `json:"showWeekday,omitempty"`
	// One summary (2/3) instead of a chip for each datasource
	Compact *bool `json:"compact,omitempty"`
	// Show the signed-in name beside the icon
	ShowName *bool `json:"showName,omitempty"`
	// Show only this recipe; missing shows every recipe
	RecipeID *string `json:"recipeId,omitempty"`
	// List each recipe's tags and values (default true)
	ShowEntries *bool `json:"showEntries,omitempty"`
	// Table widget rows
	Rows []TableRow `json:"rows,omitempty"`
}

type Preset struct {
	Description *string `json:"description,omitempty"`
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	// Ordinary widgets; x and y are relative to the preset's top-left corner, ids are replaced
	// on insert
	Widgets []Widget `json:"widgets"`
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

// JavaScript the runtime runs in its own sandbox, writing through the write pipeline as
// scriptRole, and only to the tags in its writes list
type RuntimeScript struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// JavaScript (the script API: readTag, writeTag, onChange, every, after, log, emit, alarms)
	Source  string        `json:"source"`
	Trigger ScriptTrigger `json:"trigger"`
	// The tags the script may write: datasource:path, ns:path, or a prefix ending in * (mem:*,
	// ns:Line1/*). A listed tag needs no widget; a script without the list writes nothing
	Writes []string `json:"writes,omitempty"`
}

// When a runtime script runs; it can name several
type ScriptTrigger struct {
	// Run every this many milliseconds
	Every *int64 `json:"every,omitempty"`
	// Alarm rule ids: run when one raises or clears
	OnAlarm []string `json:"onAlarm,omitempty"`
	// Tag paths (ds:path or ns:path): run when one changes
	OnChange []string `json:"onChange,omitempty"`
	// Run once when the project starts
	OnStart *bool `json:"onStart,omitempty"`
}

// Login settings. Missing means mode 'none'. Users live on the runtime (security.db), not
// in the project
type Security struct {
	Mode AuthMode `json:"mode"`
}

// A typed value kept per browser tab, read as {session:name}
type SessionVar struct {
	// The value when the tab opens; missing means false, 0 or empty text
	Initial *TransformValue `json:"initial,omitempty"`
	// Letters, digits and _
	Name string `json:"name"`
	Type Type   `json:"type"`
}

// The frame around the pages in the operator screen
type Shell struct {
	// builtin (the default) draws the operator's own top bar and navigation; custom draws the
	// frame slots instead
	Chrome *Chrome `json:"chrome,omitempty"`
	// With chrome custom: custom widgets pinned to the edges of every page, drawn around the
	// page
	Frame []FrameSlot `json:"frame,omitempty"`
	Nav   *ShellNav   `json:"nav,omitempty"`
}

// A custom widget pinned to an edge of the screen, with the page drawn in the room that is
// left. A smaller screen can move it to another edge or give it another size
type FrameSlot struct {
	CustomWidgetID string `json:"customWidgetId"`
	// Screen sizes it is drawn on; missing means all
	Devices []DeviceElement `json:"devices,omitempty"`
	Edge    FrameEdge       `json:"edge"`
	ID      string          `json:"id"`
	// Parameter name to binding, as on a custom widget placed on a page
	Params map[string]string  `json:"params,omitempty"`
	Phone  *FrameSlotOverride `json:"phone,omitempty"`
	// Pixels high for a top or bottom edge, wide for a left or right edge
	Size   int64              `json:"size"`
	Tablet *FrameSlotOverride `json:"tablet,omitempty"`
}

// What differs on a smaller screen; a phone inherits from the tablet and the tablet from
// the desktop
type FrameSlotOverride struct {
	Edge *FrameEdge `json:"edge,omitempty"`
	Size *int64     `json:"size,omitempty"`
}

// The look of every screen: a preset, light or dark, and any element changed from the
// preset. A browser can still pick light or dark for itself; that choice is not saved in
// the project
//
// A preset sets every element; an element named here replaces the preset's choice, so a
// theme can be taken whole or built from its parts
type Theme struct {
	// The main color of buttons and selections as #rrggbb; replaces the palette's
	Accent  *string       `json:"accent,omitempty"`
	Corners *ThemeCorners `json:"corners,omitempty"`
	Density *ThemeDensity `json:"density,omitempty"`
	Depth   *ThemeDepth   `json:"depth,omitempty"`
	Font    *ThemeFont    `json:"font,omitempty"`
	Mode    *ThemeMode    `json:"mode,omitempty"`
	Palette *ThemePalette `json:"palette,omitempty"`
	Preset  *ThemePreset  `json:"preset,omitempty"`
}

type Udt struct {
	Description *string    `json:"description,omitempty"`
	Fields      []UDTField `json:"fields"`
	ID          string     `json:"id"`
	Name        string     `json:"name"`
}

type UDTField struct {
	Description *string `json:"description,omitempty"`
	Name        string  `json:"name"`
	Type        Type    `json:"type"`
	Unit        *string `json:"unit,omitempty"`
}

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

// Across the direction
type Align string

const (
	AlignCenter Align = "center"
	AlignEnd    Align = "end"
	AlignStart  Align = "start"
	Stretch     Align = "stretch"
)

type Direction string

const (
	Column Direction = "column"
	Row    Direction = "row"
)

// Along the direction
type Justify string

const (
	Between       Justify = "between"
	JustifyCenter Justify = "center"
	JustifyEnd    Justify = "end"
	JustifyStart  Justify = "start"
)

// free: each part at its own place; stack: parts follow each other
type Mode string

const (
	Free  Mode = "free"
	Stack Mode = "stack"
)

type TransformKind string

const (
	Linear           TransformKind = "linear"
	Thresholds       TransformKind = "thresholds"
	TransformKindMap TransformKind = "map"
)

type ActionType string

const (
	Increment ActionType = "increment"
	Navigate  ActionType = "navigate"
	OpenURL   ActionType = "openUrl"
	Toggle    ActionType = "toggle"
	Write     ActionType = "write"
)

type HiddenOn string

const (
	HiddenOnPhone  HiddenOn = "phone"
	HiddenOnTablet HiddenOn = "tablet"
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
	ButtonVariantFlat ButtonVariant = "flat"
	Filled            ButtonVariant = "filled"
	Ghost             ButtonVariant = "ghost"
	Industrial        ButtonVariant = "industrial"
	Outlined          ButtonVariant = "outlined"
)

// Image object-fit, as set by the properties panel
type ImageFit string

const (
	Contain ImageFit = "contain"
	Cover   ImageFit = "cover"
	Fill    ImageFit = "fill"
)

// What to show; missing means timeSeconds
type Format string

const (
	Date        Format = "date"
	DateTime    Format = "dateTime"
	FormatTime  Format = "time"
	TimeSeconds Format = "timeSeconds"
)

// Symbol: what it does while animate is true
//
// still: never moves. spin: turns round. pulse: fades in and out. A person who asks the
// browser for less motion sees it still
type SymbolMotion string

const (
	Pulse SymbolMotion = "pulse"
	Spin  SymbolMotion = "spin"
	Still SymbolMotion = "still"
)

// list: icon and name down the side, grouped; tabs: names in a row; icons: large icon
// buttons in a row; bar: icon over name, sharing the width
type Style string

const (
	Bar       Style = "bar"
	Icons     Style = "icons"
	StyleList Style = "list"
	StyleTabs Style = "tabs"
)

type TextAlign string

const (
	TextAlignCenter TextAlign = "center"
	TextAlignLeft   TextAlign = "left"
	TextAlignRight  TextAlign = "right"
)

// Trend X-axis label format
type TrendXFormat string

const (
	Datetime         TrendXFormat = "datetime"
	Relative         TrendXFormat = "relative"
	TimeShort        TrendXFormat = "time-short"
	TrendXFormatTime TrendXFormat = "time"
)

type WidgetType string

const (
	AlarmBanner    WidgetType = "alarmBanner"
	Button         WidgetType = "button"
	Clock          WidgetType = "clock"
	CustomWidget   WidgetType = "customWidget"
	DriverStatus   WidgetType = "driverStatus"
	Gauge          WidgetType = "gauge"
	HistoryLog     WidgetType = "historyLog"
	Image          WidgetType = "image"
	LED            WidgetType = "led"
	MultiState     WidgetType = "multiState"
	NumericDisplay WidgetType = "numericDisplay"
	NumericInput   WidgetType = "numericInput"
	PageList       WidgetType = "pageList"
	Pipe           WidgetType = "pipe"
	Recipes        WidgetType = "recipes"
	Setpoint       WidgetType = "setpoint"
	Symbol         WidgetType = "symbol"
	Table          WidgetType = "table"
	Tank           WidgetType = "tank"
	TextDisplay    WidgetType = "textDisplay"
	TextInput      WidgetType = "textInput"
	Trend          WidgetType = "trend"
	UserMenu       WidgetType = "userMenu"
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

type Type string

const (
	Bool   Type = "bool"
	Int    Type = "int"
	Real   Type = "real"
	String Type = "string"
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
	Memory                DatasourceType = "memory"
	Mqtt                  DatasourceType = "mqtt"
	Opcua                 DatasourceType = "opcua"
	REST                  DatasourceType = "rest"
)

type NamespaceNodeType string

const (
	Asset                    NamespaceNodeType = "asset"
	Folder                   NamespaceNodeType = "folder"
	NamespaceNodeTypeVirtual NamespaceNodeType = "virtual"
	Tag                      NamespaceNodeType = "tag"
)

// Shown beside the page's name in the navigation; missing shows the name's first letter
type PageIcon string

const (
	Alarm        PageIcon = "alarm"
	Bolt         PageIcon = "bolt"
	Chart        PageIcon = "chart"
	Dial         PageIcon = "dial"
	Flask        PageIcon = "flask"
	Graph        PageIcon = "graph"
	Home         PageIcon = "home"
	Motor        PageIcon = "motor"
	PageIconList PageIcon = "list"
	PageIconMap  PageIcon = "map"
	Pump         PageIcon = "pump"
	Settings     PageIcon = "settings"
	Tools        PageIcon = "tools"
	User         PageIcon = "user"
	Valve        PageIcon = "valve"
	Vessel       PageIcon = "vessel"
)

// The role runtime scripts write as (roles and limits apply, and the audit names the
// script); missing means operator
type Role string

const (
	Admin      Role = "admin"
	Engineer   Role = "engineer"
	Operator   Role = "operator"
	Supervisor Role = "supervisor"
)

// none: no login, anyone who reaches the runtime can read and write. login: every user must
// log in
type AuthMode string

const (
	AuthModeNone AuthMode = "none"
	Login        AuthMode = "login"
)

// builtin (the default) draws the operator's own top bar and navigation; custom draws the
// frame slots instead
type Chrome string

const (
	Builtin Chrome = "builtin"
	Custom  Chrome = "custom"
)

type DeviceElement string

const (
	Desktop      DeviceElement = "desktop"
	DevicePhone  DeviceElement = "phone"
	DeviceTablet DeviceElement = "tablet"
)

type FrameEdge string

const (
	Bottom         FrameEdge = "bottom"
	FrameEdgeLeft  FrameEdge = "left"
	FrameEdgeRight FrameEdge = "right"
	Top            FrameEdge = "top"
)

// How a person moves between pages: a list on the left, a row of large icon buttons, or
// tabs. A phone always gets a bar along the bottom. Missing means tabs
type ShellNav string

const (
	ShellNavTabs ShellNav = "tabs"
	Sidebar      ShellNav = "sidebar"
	Toolbar      ShellNav = "toolbar"
)

// Corner radius of cards and controls: 2, 6 or 12 px
type ThemeCorners string

const (
	Round  ThemeCorners = "round"
	Soft   ThemeCorners = "soft"
	Square ThemeCorners = "square"
)

// Padding and text size. touch is larger, with controls at least 44 px tall, for tablets
// and panels
type ThemeDensity string

const (
	Comfortable ThemeDensity = "comfortable"
	Compact     ThemeDensity = "compact"
	Touch       ThemeDensity = "touch"
)

// flat: a 1 px border. raised: a soft shadow. borderless: neither, the cards stand out by
// color alone
type ThemeDepth string

const (
	Borderless     ThemeDepth = "borderless"
	Raised         ThemeDepth = "raised"
	ThemeDepthFlat ThemeDepth = "flat"
)

// The text font. All but system are bundled, so a PLC with no internet shows the same text
type ThemeFont string

const (
	Inter    ThemeFont = "inter"
	NotoSans ThemeFont = "noto-sans"
	OpenSans ThemeFont = "open-sans"
	Roboto   ThemeFont = "roboto"
	System   ThemeFont = "system"
)

// Missing means the preset's own (light for calm and clean, dark for modern)
type ThemeMode string

const (
	Dark  ThemeMode = "dark"
	Light ThemeMode = "light"
)

// The colors: calm is gray with a muted blue; modern is cool white or charcoal with a
// bright blue
type ThemePalette string

const (
	ThemePaletteCalm   ThemePalette = "calm"
	ThemePaletteModern ThemePalette = "modern"
)

// calm: ISA-101 gray, flat, square corners, color only for abnormal states. clean: white
// cards, soft depth, round corners. modern: charcoal, soft corners, borders instead of
// shadows. Missing means calm
type ThemePreset string

const (
	Clean             ThemePreset = "clean"
	ThemePresetCalm   ThemePreset = "calm"
	ThemePresetModern ThemePreset = "modern"
)

// thresholds: the value under the first step; missing leaves the property's own setting
//
// A text, number or flag value (transform values, initial values)
//
// map: the value when no case matches; missing leaves the property's own setting
//
// The value before anything is written (and after a restart, unless retained); missing
// means false, 0 or empty text
//
// The value when the tab opens; missing means false, 0 or empty text
type TransformValue struct {
	Bool   *bool
	Double *float64
	String *string
}
