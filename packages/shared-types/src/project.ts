/**
 * Speth's Screens project file — single source of truth. Generated types:
 * internal/project/types.go + packages/shared-types/src/project.ts
 */
export interface Project {
    alarmRules?:       AlarmRule[];
    assets?:           AssetNode[];
    canvasResolution?: CanvasResolution;
    canvasSnap?:       CanvasSnap;
    customWidgets?:    CustomWidget[];
    datasources:       Datasource[];
    /**
     * Symbol pack ids shown in the IDE symbol library. Missing means all packs
     */
    enabledSymbolPacks?: string[];
    /**
     * What the historian stores and for how long. Missing means every change, plus one sample
     * per tag every 60 s, kept for the runtime's --history-retention (default 7 days)
     */
    historian?: HistorianSettings;
    images?:    ImageAsset[];
    /**
     * Language codes the screens can be shown in, such as en, de, es. The first is the language
     * the project's text is written in; the operator screen offers a switch when there are two
     * or more
     */
    languages?: string[];
    /**
     * Human-readable project name
     */
    name?: string;
    /**
     * Unified Namespace — flat list of folders, assets and tags. Tags with driverId+driverAddr
     * are bound to a live datasource
     */
    namespace?: NamespaceNode[];
    pages:      Page[];
    /**
     * Operator PIN — operator panel locks behind this if set
     */
    pin?: string;
    /**
     * Widget presets: set-up widgets saved for reuse. Inserting one copies its widgets onto a
     * page with new ids; nothing links back to the preset. The runtime ignores presets.
     */
    presets?: Preset[];
    recipes?: Recipe[];
    /**
     * Project file format. A file without it is format 1 and is upgraded when opened
     */
    schemaVersion: number;
    /**
     * The role runtime scripts write as (roles and limits apply, and the audit names the
     * script); missing means operator
     */
    scriptRole?: Role;
    /**
     * Runtime scripts: JavaScript the runtime runs on its own (goja), on the triggers each one
     * names
     */
    scripts?: RuntimeScript[];
    /**
     * Login settings. Missing means mode 'none'. Users live on the runtime (security.db), not
     * in the project
     */
    security?: Security;
    /**
     * Variables kept per browser tab, read as {session:name}; they never reach the runtime
     */
    sessionVars?: SessionVar[];
    shell?:       Shell;
    /**
     * The look of every screen: a preset, light or dark, and any element changed from the
     * preset. A browser can still pick light or dark for itself; that choice is not saved in
     * the project
     */
    theme?: Theme;
    /**
     * For each language, the project's text as written (page names, labels, alarm messages)
     * mapped to its translation. A text with no entry shows as written
     */
    translations?: { [key: string]: { [key: string]: string } };
    udts?:         Udt[];
    /**
     * Schema version, e.g. '0.1.0'
     */
    version: string;
    /**
     * Disable all write widgets in the operator panel
     */
    viewOnly?: boolean;
}

export interface AlarmRule {
    /**
     * Expression (the Speth's Screens expression language): the alarm is active while it is
     * true, e.g. {ns:Tank1/Level} > 95 && {ns:Tank1/InletOpen}. While an input it needs is Bad
     * or missing, the alarm stays as it is
     */
    expr:     string;
    id:       string;
    message:  string;
    name:     string;
    severity: AlarmSeverity;
}

export type AlarmSeverity = "critical" | "warning" | "info";

export interface AssetNode {
    description?: string;
    iconType?:    AssetIconType;
    id:           string;
    name:         string;
    parentId?:    string;
    tagPrefix?:   string;
    udtId?:       string;
}

export type AssetIconType = "plant" | "area" | "unit" | "device" | "sensor";

/**
 * Screen size. 'dynamic' fills the browser window; 'fixed' uses width and height in pixels
 */
export interface CanvasResolution {
    /**
     * fixed only
     */
    height?: number;
    type:    CanvasResolutionType;
    /**
     * fixed only
     */
    width?: number;
}

export type CanvasResolutionType = "dynamic" | "fixed";

export type CanvasSnap = "grid" | "pixel";

export interface CustomWidget {
    description?: string;
    id:           string;
    /**
     * How the parts are placed; missing means free (each at its own x, y, w, h)
     */
    layout?: CustomWidgetLayout;
    name:    string;
    params:  CustomWidgetParam[];
    widgets: CustomWidgetPart[];
}

/**
 * How the parts are placed; missing means free (each at its own x, y, w, h)
 *
 * How a custom widget places its parts. In a stack the parts follow each other in a row or
 * a column and share the room by their flex settings; tablet and phone replace any field
 * for that screen size
 */
export interface CustomWidgetLayout {
    /**
     * Across the direction
     */
    align?:     Align;
    direction?: Direction;
    /**
     * Pixels between parts
     */
    gap?: number;
    /**
     * Along the direction
     */
    justify?: Justify;
    /**
     * free: each part at its own place; stack: parts follow each other
     */
    mode?: Mode;
    /**
     * Pixels around the parts
     */
    padding?: number;
    phone?:   CustomWidgetLayoutOverride;
    tablet?:  CustomWidgetLayoutOverride;
    /**
     * Parts that do not fit start a new line
     */
    wrap?: boolean;
}

/**
 * Across the direction
 */
export type Align = "start" | "center" | "end" | "stretch";

export type Direction = "row" | "column";

/**
 * Along the direction
 */
export type Justify = "start" | "center" | "end" | "between";

/**
 * free: each part at its own place; stack: parts follow each other
 */
export type Mode = "free" | "stack";

/**
 * The stack settings that differ on a smaller screen; a phone inherits from the tablet and
 * the tablet from the desktop
 */
export interface CustomWidgetLayoutOverride {
    align?:     Align;
    direction?: Direction;
    gap?:       number;
    justify?:   Justify;
    padding?:   number;
    wrap?:      boolean;
}

export interface CustomWidgetParam {
    description?: string;
    /**
     * Used as {name} in bindings inside the custom widget
     */
    name: string;
}

/**
 * A widget inside a custom widget. Same as Widget, but identified by localId, and it may
 * say how it is laid out in a stack (flex, hiddenOn)
 */
export interface CustomWidgetPart {
    bindings?: WidgetBindings;
    /**
     * Driven properties, by property name; which names a widget type has is listed in TypedProps
     */
    dynamics?: { [key: string]: Drive };
    events?:   WidgetEvents;
    flex?:     PartFlex;
    /**
     * IDE-only: widgets with the same groupId move together
     */
    groupId?: string;
    /**
     * Height in grid units
     */
    h: number;
    /**
     * Screen sizes this part is left out of
     */
    hiddenOn?: HiddenOn[];
    localId:   string;
    /**
     * IDE-only: widget cannot be moved or resized
     */
    locked?: boolean;
    /**
     * This widget type's settings (see TypedProps)
     */
    props?: CustomWidgetPartProps;
    type:   WidgetType;
    /**
     * Width in grid units
     */
    w: number;
    /**
     * Grid column
     */
    x: number;
    /**
     * Grid row
     */
    y: number;
}

/**
 * The tags a widget reads, by slot. Values are ds:path or ns:path (widgets inside a custom
 * widget may use {param})
 */
export interface WidgetBindings {
    /**
     * Tag the frame's color thresholds read; missing means the value tag
     */
    color?: string;
    /**
     * The tag the widget shows or writes
     */
    value?: string;
    /**
     * BOOL tag: the widget is hidden while it is 0/false
     */
    visible?: string;
}

/**
 * Drives one property of a widget: the expression's value, through the transform if there
 * is one. An unknown result, or a value of the wrong type for the property, leaves the
 * property's own setting
 */
export interface Drive {
    /**
     * Expression (the Speth's Screens expression language); value is the widget's value tag
     */
    expr:       string;
    transform?: Transform;
}

/**
 * Turns an expression value into a property value. linear: scale in to out; thresholds: the
 * value of the last step whose above the value reaches; map: the value of the case it equals
 */
export interface Transform {
    /**
     * thresholds: the value under the first step; missing leaves the property's own setting
     */
    below?: boolean | number | string;
    /**
     * map: the cases, first match wins
     */
    cases?: MapCase[];
    /**
     * linear: keep the result inside out; missing means true
     */
    clamp?: boolean;
    /**
     * map: the value when no case matches; missing leaves the property's own setting
     */
    default?: boolean | number | string;
    /**
     * linear: input range [low, high]
     */
    in?:  number[];
    kind: TransformKind;
    /**
     * linear: output range [low, high]
     */
    out?: number[];
    /**
     * thresholds: steps in ascending order of above
     */
    steps?: ThresholdStep[];
}

export interface MapCase {
    equals: boolean | number | string;
    value:  boolean | number | string;
}

export type TransformKind = "linear" | "thresholds" | "map";

export interface ThresholdStep {
    above: number;
    value: boolean | number | string;
}

/**
 * What a widget does when touched. onPress and onRelease write at once (momentary); onClick
 * actions may be confirmed
 */
export interface WidgetEvents {
    onClick?:   Action[];
    onPress?:   Action[];
    onRelease?: Action[];
}

/**
 * One thing a widget does when an event happens
 */
export interface Action {
    /**
     * toggle: the value written when the tag is on; missing means 0 (false for a bool tag)
     */
    off?: any;
    /**
     * toggle: the value written when the tag is off; missing means 1 (true for a bool tag)
     */
    on?: any;
    /**
     * navigate: target page id
     */
    page?: string;
    /**
     * increment: the amount added; missing means 1
     */
    step?: number;
    /**
     * write, toggle, increment: the tag; missing means the widget's value tag
     */
    tag?: string;
    type: ActionType;
    /**
     * openUrl: the URL
     */
    url?: string;
    /**
     * write: the value
     */
    value?: any;
}

export type ActionType = "write" | "toggle" | "increment" | "navigate" | "openUrl";

/**
 * How a part takes room in a stack; a part with no flex keeps the size it has in the layout
 * (w and h as grid units)
 */
export interface PartFlex {
    /**
     * Size along the direction in pixels; 0 or missing fits the content
     */
    basis?: number;
    /**
     * Share of the free room; 0 keeps the part at its basis
     */
    grow?:   number;
    phone?:  PartFlexOverride;
    tablet?: PartFlexOverride;
}

/**
 * What differs on a smaller screen; a phone inherits from the tablet and the tablet from
 * the desktop
 */
export interface PartFlexOverride {
    basis?: number;
    grow?:  number;
}

export type HiddenOn = "tablet" | "phone";

/**
 * This widget type's settings (see TypedProps)
 *
 * Settings of a gauge widget
 *
 * Settings of the frame every widget is drawn in. Each widget type's settings include
 * these
 *
 * Settings of a numericDisplay widget
 *
 * Settings of a textDisplay widget
 *
 * Settings of a led widget
 *
 * Settings of a tank widget
 *
 * Settings of a button widget
 *
 * Settings of a setpoint widget
 *
 * Settings of a multiState widget
 *
 * Settings of a trend widget
 *
 * Settings of a numericInput widget
 *
 * Settings of a textInput widget
 *
 * Settings of a historyLog widget
 *
 * Settings of a alarmBanner widget
 *
 * Settings of a image widget
 *
 * Settings of a symbol widget
 *
 * Settings of a pipe widget: a line through points with an animated flow
 *
 * Settings of a custom widget placement
 *
 * Settings of a page list widget: the project's pages as navigation, the open one
 * highlighted
 *
 * Settings of a clock widget: the time in the operator's browser
 *
 * Settings of a driver status widget: whether each datasource is connected
 *
 * Settings of a user menu widget: who is signed in, and signing in or out
 *
 * Settings of a recipes widget: the project's recipes, each with a button that writes its
 * values
 *
 * Settings of a table widget
 */
export interface CustomWidgetPartProps {
    max?:        number;
    min?:        number;
    thresholds?: Threshold[];
    unit?:       string;
    bgColor?:    string;
    /**
     * Color the frame flashes while blinking; missing means the widget fades in and out
     */
    blinkColor?: string;
    /**
     * Blink period in milliseconds while dynamics.blink is on; missing means 800
     */
    blinkPeriodMs?: number;
    borderColor?:   string;
    /**
     * Border width in pixels; missing means the theme's
     */
    borderWidth?: number;
    /**
     * Frame border color rules, applied to the color tag (bindings.color, else the value tag)
     */
    colorThresholds?: Threshold[];
    fontBold?:        boolean;
    /**
     * mono | sans | serif; empty means the theme font
     */
    fontFamily?: string;
    fontItalic?: boolean;
    /**
     * Exact text size in pixels; overrides fontSize
     */
    fontPx?: number;
    /**
     * xs | sm | base | lg | xl | 2xl | 3xl | 4xl | 5xl | 6xl, or fit (the text grows to fill
     * the card); empty means the widget's own size
     */
    fontSize?:      string;
    fontUnderline?: boolean;
    label?:         string;
    noPadding?:     boolean;
    /**
     * Space inside the card in pixels; overrides noPadding and the theme
     */
    padding?: number;
    /**
     * Corner radius in pixels; missing means the theme's
     */
    radius?: number;
    /**
     * false removes the card's shadow; missing means the theme's
     */
    shadow?: boolean;
    /**
     * false hides the label above the value; missing means shown
     */
    showLabel?: boolean;
    /**
     * Show the tag quality indicator
     */
    showQuality?: boolean;
    /**
     * false hides the unit beside the value; missing means shown
     */
    showUnit?:  boolean;
    textAlign?: TextAlign;
    textColor?: string;
    /**
     * top | center | bottom: where the value sits in the card; missing means center
     */
    valign?: string;
    /**
     * TextDisplay: fixed text shown instead of a tag value
     */
    staticText?: string;
    /**
     * LED color when false
     */
    falseColor?: string;
    /**
     * LED text when false
     */
    falseLabel?: string;
    /**
     * LED color when true
     */
    trueColor?: string;
    /**
     * LED text when true
     */
    trueLabel?:  string;
    btnColor?:   ButtonColor;
    btnRounded?: ButtonRounded;
    btnVariant?: ButtonVariant;
    /**
     * Button icon (emoji or short text)
     */
    icon?: string;
    /**
     * Toggle button color when off
     */
    toggleOffColor?: string;
    /**
     * Toggle button color when on
     */
    toggleOnColor?: string;
    /**
     * Setpoint slider step
     */
    step?: number;
    /**
     * MultiState value→label→color map
     */
    states?: StateEntry[];
    /**
     * fit (follow the visible data) | nice (follow it, rounded to tidy numbers) | fixed (use
     * min and max, or each pen's yMin and yMax); missing means fit when no limits are set, else
     * fixed
     */
    autoscale?: string;
    /**
     * Trend history window in seconds
     */
    duration?: number;
    /**
     * false starts the trend paused; missing means running
     */
    live?: boolean;
    /**
     * Trend horizontal reference lines
     */
    refLines?: RefLine[];
    /**
     * Missing means shown
     */
    showGrid?: boolean;
    /**
     * Missing means shown
     */
    showLegend?: boolean;
    /**
     * Window, pause and history buttons; missing means shown
     */
    showToolbar?: boolean;
    /**
     * Trend multi-series config
     */
    tags?: TrendSeries[];
    /**
     * Seconds of each window button; missing means 30, 60, 300 and 3600
     */
    windows?: number[];
    xFormat?: TrendXFormat;
    /**
     * HistoryLog rows per page
     */
    pageSize?: number;
    /**
     * AlarmBanner max visible rows
     */
    maxRows?: number;
    /**
     * AlarmBanner: show acknowledged alarms
     */
    showAcked?: boolean;
    /**
     * Image object-fit, as set by the properties panel
     */
    fit?: ImageFit;
    /**
     * Image: data-URL, URL or 'lib:<imageId>'
     */
    src?: string;
    /**
     * Symbol: true while the symbol should move (a pump running); drive it from a tag
     */
    animate?: boolean;
    /**
     * Symbol: seconds for one turn or one pulse; missing means 2
     *
     * Pipe: seconds for the dashes to move one step; missing means 1
     */
    cycleSeconds?: number;
    /**
     * Symbol: what it does while animate is true
     */
    motion?: SymbolMotion;
    /**
     * Symbol: stroke color
     */
    stroke?: string;
    /**
     * Symbol: id from a symbol pack
     */
    symbolId?: string;
    /**
     * Pipe: the pipe's color, a CSS color or a token such as token:process-running
     */
    color?: string;
    /**
     * Pipe: true while something flows; drive it from a tag
     */
    flow?: boolean;
    /**
     * Pipe: the color of the moving dashes; missing means the theme's own
     */
    flowColor?: string;
    /**
     * Pipe: the corners as x,y pairs from 0 to 100 across the widget, e.g. "0,50 60,50 60,100"
     */
    points?: string;
    /**
     * Pipe: flow runs from the last point to the first
     */
    reverse?: boolean;
    /**
     * Pipe: line width in pixels; missing means 8
     */
    weight?: number;
    /**
     * Custom widget: id of the custom widget to show
     */
    customWidgetId?: string;
    /**
     * Custom widget: parameter name → binding
     */
    params?: { [key: string]: string };
    /**
     * list: show each page group's heading (default true)
     */
    showGroups?: boolean;
    /**
     * list: icon and name down the side, grouped; tabs: names in a row; icons: large icon
     * buttons in a row; bar: icon over name, sharing the width
     */
    style?: Style;
    /**
     * What to show; missing means timeSeconds
     */
    format?: Format;
    /**
     * 12-hour clock instead of 24-hour
     */
    hour12?: boolean;
    /**
     * Put the weekday first (default true)
     */
    showWeekday?: boolean;
    /**
     * One summary (2/3) instead of a chip for each datasource
     */
    compact?: boolean;
    /**
     * Show the signed-in name beside the icon
     */
    showName?: boolean;
    /**
     * Show only this recipe; missing shows every recipe
     */
    recipeId?: string;
    /**
     * List each recipe's tags and values (default true)
     */
    showEntries?: boolean;
    /**
     * Table widget rows
     */
    rows?: TableRow[];
    [property: string]: any;
}

export type ButtonColor = "blue" | "green" | "red" | "amber" | "zinc" | "purple" | "orange" | "white";

export type ButtonRounded = "none" | "sm" | "md" | "lg" | "full";

export type ButtonVariant = "filled" | "outlined" | "ghost" | "flat" | "industrial";

export interface Threshold {
    /**
     * CSS color, e.g. '#22c55e'
     */
    color: string;
    /**
     * Optional upper bound (exclusive). If set, matches value >= value && value < toValue. If
     * missing, matches value >= value (open-ended, highest match wins)
     */
    toValue?: number;
    value:    number;
}

/**
 * Image object-fit, as set by the properties panel
 */
export type ImageFit = "contain" | "cover" | "fill";

/**
 * What to show; missing means timeSeconds
 */
export type Format = "time" | "timeSeconds" | "dateTime" | "date";

/**
 * Symbol: what it does while animate is true
 *
 * still: never moves. spin: turns round. pulse: fades in and out. A person who asks the
 * browser for less motion sees it still
 */
export type SymbolMotion = "still" | "spin" | "pulse";

export interface RefLine {
    color:  string;
    label?: string;
    value:  number;
}

export interface TableRow {
    binding: string;
    label:   string;
    unit?:   string;
}

export interface StateEntry {
    color:      string;
    label:      string;
    textColor?: string;
    value:      any;
}

/**
 * list: icon and name down the side, grouped; tabs: names in a row; icons: large icon
 * buttons in a row; bar: icon over name, sharing the width
 */
export type Style = "list" | "tabs" | "icons" | "bar";

export interface TrendSeries {
    /**
     * own | shared: shared pens use one Y scale (the first shared pen's); missing means own
     */
    axis?:   string;
    binding: string;
    color:   string;
    /**
     * solid | dashed | dotted; missing means solid
     */
    dash?:  string;
    fill?:  boolean;
    label?: string;
    /**
     * line | step | area | dots | bars; missing means line
     */
    style?: string;
    /**
     * Pen width in pixels; missing means 1.5
     */
    width?: number;
    yMax?:  number;
    yMin?:  number;
}

export type TextAlign = "left" | "center" | "right";

/**
 * Trend X-axis label format
 */
export type TrendXFormat = "time" | "time-short" | "relative" | "datetime";

export type WidgetType = "gauge" | "trend" | "led" | "button" | "numericInput" | "numericDisplay" | "textInput" | "textDisplay" | "historyLog" | "tank" | "setpoint" | "multiState" | "alarmBanner" | "image" | "symbol" | "customWidget" | "table" | "pipe" | "pageList" | "clock" | "driverStatus" | "userMenu" | "recipes";

export interface Datasource {
    config: DatasourceConfig;
    /**
     * Unique driver instance ID, e.g. 'opcua', 'mbtcp1'
     */
    id:    string;
    label: string;
    type:  DatasourceType;
}

/**
 * Driver-specific connection config. Fields used depend on 'type'.
 */
export interface DatasourceConfig {
    /**
     * REST base path, e.g. /_pxc_api/v1.14
     */
    basePath?: string;
    /**
     * REST bearer token
     */
    bearerToken?: string;
    /**
     * How the server's certificate is checked (https REST, ssl MQTT, OPC UA with security).
     * Missing keeps the driver's old behavior: REST off, MQTT trusted, OPC UA off
     */
    certCheck?: CERTCheck;
    /**
     * SHA-256 fingerprint of the server certificate, for certCheck 'pinned' (hex, colons
     * optional)
     */
    certFingerprint?: string;
    /**
     * MQTT client ID
     */
    clientId?: string;
    /**
     * OPC UA: opc.tcp://host:port
     */
    endpoint?: string;
    /**
     * Modbus/MQTT/REST host
     */
    host?: string;
    /**
     * Memory datasource: the typed tags it holds
     */
    memoryTags?: MemoryTag[];
    password?:   string;
    /**
     * TCP port
     */
    port?:           number;
    securityMode?:   SecurityMode;
    securityPolicy?: SecurityPolicy;
    /**
     * Modbus slave/unit ID
     */
    slaveId?: number;
    /**
     * Virtual driver: the calculated tags
     */
    tags?:     CalculatedTag[];
    username?: string;
}

/**
 * How the server's certificate is checked (https REST, ssl MQTT, OPC UA with security).
 * Missing keeps the driver's old behavior: REST off, MQTT trusted, OPC UA off
 *
 * off: accept any certificate; pinned: only the one with certFingerprint; trusted:
 * certificates the system trusts
 */
export type CERTCheck = "off" | "pinned" | "trusted";

/**
 * A typed value the runtime holds; other expressions read it as {datasource:path}
 */
export interface MemoryTag {
    /**
     * The value before anything is written (and after a restart, unless retained); missing
     * means false, 0 or empty text
     */
    initial?: boolean | number | string;
    /**
     * The tag's name in this datasource
     */
    path: string;
    /**
     * Keep the last value across a runtime restart
     */
    retain?: boolean;
    type:    Type;
}

export type Type = "bool" | "int" | "real" | "string";

export type SecurityMode = "None" | "Sign" | "SignAndEncrypt";

export type SecurityPolicy = "None" | "Basic128Rsa15" | "Basic256" | "Basic256Sha256";

/**
 * A tag the virtual driver computes. Other expressions read it as {datasource:path}
 */
export interface CalculatedTag {
    /**
     * Expression giving its value, e.g. clamp({mb:AI0} / 4095 * 100, 0, 100). A Bad or missing
     * input makes the tag Bad
     */
    expr: string;
    /**
     * The tag's name in this datasource
     */
    path: string;
}

export type DatasourceType = "opcua" | "mbtcp" | "mqtt" | "rest" | "virtual" | "memory";

/**
 * What the historian stores and for how long. Missing means every change, plus one sample
 * per tag every 60 s, kept for the runtime's --history-retention (default 7 days)
 */
export interface HistorianSettings {
    /**
     * Default deadband in each tag's own units: a number is stored when it moves more than this
     * from the last stored value. 0 stores any change. Text and true/false values ignore it
     */
    deadband?: number;
    /**
     * Days of history kept. Overrides the runtime's --history-retention
     */
    retentionDays?: number;
    /**
     * Rules for single tags or groups; the most specific rule wins
     */
    tags?: HistorianTagRule[];
}

export interface HistorianTagRule {
    /**
     * Deadband for these tags; missing uses the default
     */
    deadband?: number;
    /**
     * Tag as datasource:path, e.g. 'plc1:Arp.Plc.Eclr/rTemp'. Ending in * matches every tag
     * starting with the rest
     */
    path: string;
    /**
     * false leaves these tags out of the history (default true)
     */
    store?: boolean;
}

export interface ImageAsset {
    /**
     * base64 data URL
     */
    dataUrl:  string;
    height:   number;
    id:       string;
    mimeType: string;
    name:     string;
    /**
     * Original file size in bytes
     */
    size:  number;
    width: number;
}

export interface NamespaceNode {
    /**
     * float | bool | string | int
     */
    dataType?:    string;
    description?: string;
    /**
     * Raw driver address of the tag
     */
    driverAddr?: string;
    /**
     * Datasource id the tag comes from
     */
    driverId?: string;
    /**
     * virtual nodes: formula
     */
    expression?: string;
    meta?:       { [key: string]: string };
    /**
     * Dot-separated path, e.g. 'plant.pump1.running'
     */
    path:  string;
    type:  NamespaceNodeType;
    unit?: string;
}

export type NamespaceNodeType = "folder" | "asset" | "tag" | "virtual";

export interface Page {
    /**
     * CSS color for the page background
     */
    backgroundColor?: string;
    /**
     * Pages with the same group are listed together under that heading in the sidebar
     */
    group?: string;
    /**
     * Shown beside the page's name in the navigation; missing shows the name's first letter
     */
    icon?: PageIcon;
    id:    string;
    name:  string;
    /**
     * Page script (JavaScript source)
     */
    script?: string;
    widgets: Widget[];
}

/**
 * Shown beside the page's name in the navigation; missing shows the name's first letter
 */
export type PageIcon = "home" | "graph" | "alarm" | "settings" | "pump" | "vessel" | "valve" | "motor" | "dial" | "list" | "chart" | "map" | "user" | "tools" | "bolt" | "flask";

export interface Widget {
    bindings?: WidgetBindings;
    /**
     * Driven properties, by property name; which names a widget type has is listed in TypedProps
     */
    dynamics?: { [key: string]: Drive };
    events?:   WidgetEvents;
    /**
     * IDE-only: widgets with the same groupId move together
     */
    groupId?: string;
    /**
     * Height in grid units
     */
    h:       number;
    id:      string;
    layout?: WidgetLayouts;
    /**
     * IDE-only: widget cannot be moved or resized
     */
    locked?: boolean;
    /**
     * This widget type's settings (see TypedProps)
     */
    props?: WidgetProps;
    type:   WidgetType;
    /**
     * Width in grid units
     */
    w: number;
    /**
     * Grid column
     */
    x: number;
    /**
     * Grid row
     */
    y: number;
}

/**
 * Where the widget sits on a smaller screen. x, y, w and h above are the desktop layout; a
 * tablet (under 1024 px wide) uses what is set here, and a phone (under 640 px) uses its
 * own, then the tablet's, then the desktop's, one field at a time
 */
export interface WidgetLayouts {
    phone?:  WidgetPlacement;
    tablet?: WidgetPlacement;
}

/**
 * A widget's place on one screen size; a field left out is inherited from the next size up
 */
export interface WidgetPlacement {
    /**
     * Height
     */
    h?: number;
    /**
     * Not shown on this screen size
     */
    hidden?: boolean;
    /**
     * Width
     */
    w?: number;
    /**
     * Grid column or pixel
     */
    x?: number;
    /**
     * Grid row or pixel
     */
    y?: number;
}

/**
 * This widget type's settings (see TypedProps)
 *
 * Settings of a gauge widget
 *
 * Settings of the frame every widget is drawn in. Each widget type's settings include
 * these
 *
 * Settings of a numericDisplay widget
 *
 * Settings of a textDisplay widget
 *
 * Settings of a led widget
 *
 * Settings of a tank widget
 *
 * Settings of a button widget
 *
 * Settings of a setpoint widget
 *
 * Settings of a multiState widget
 *
 * Settings of a trend widget
 *
 * Settings of a numericInput widget
 *
 * Settings of a textInput widget
 *
 * Settings of a historyLog widget
 *
 * Settings of a alarmBanner widget
 *
 * Settings of a image widget
 *
 * Settings of a symbol widget
 *
 * Settings of a pipe widget: a line through points with an animated flow
 *
 * Settings of a custom widget placement
 *
 * Settings of a page list widget: the project's pages as navigation, the open one
 * highlighted
 *
 * Settings of a clock widget: the time in the operator's browser
 *
 * Settings of a driver status widget: whether each datasource is connected
 *
 * Settings of a user menu widget: who is signed in, and signing in or out
 *
 * Settings of a recipes widget: the project's recipes, each with a button that writes its
 * values
 *
 * Settings of a table widget
 */
export interface WidgetProps {
    max?:        number;
    min?:        number;
    thresholds?: Threshold[];
    unit?:       string;
    bgColor?:    string;
    /**
     * Color the frame flashes while blinking; missing means the widget fades in and out
     */
    blinkColor?: string;
    /**
     * Blink period in milliseconds while dynamics.blink is on; missing means 800
     */
    blinkPeriodMs?: number;
    borderColor?:   string;
    /**
     * Border width in pixels; missing means the theme's
     */
    borderWidth?: number;
    /**
     * Frame border color rules, applied to the color tag (bindings.color, else the value tag)
     */
    colorThresholds?: Threshold[];
    fontBold?:        boolean;
    /**
     * mono | sans | serif; empty means the theme font
     */
    fontFamily?: string;
    fontItalic?: boolean;
    /**
     * Exact text size in pixels; overrides fontSize
     */
    fontPx?: number;
    /**
     * xs | sm | base | lg | xl | 2xl | 3xl | 4xl | 5xl | 6xl, or fit (the text grows to fill
     * the card); empty means the widget's own size
     */
    fontSize?:      string;
    fontUnderline?: boolean;
    label?:         string;
    noPadding?:     boolean;
    /**
     * Space inside the card in pixels; overrides noPadding and the theme
     */
    padding?: number;
    /**
     * Corner radius in pixels; missing means the theme's
     */
    radius?: number;
    /**
     * false removes the card's shadow; missing means the theme's
     */
    shadow?: boolean;
    /**
     * false hides the label above the value; missing means shown
     */
    showLabel?: boolean;
    /**
     * Show the tag quality indicator
     */
    showQuality?: boolean;
    /**
     * false hides the unit beside the value; missing means shown
     */
    showUnit?:  boolean;
    textAlign?: TextAlign;
    textColor?: string;
    /**
     * top | center | bottom: where the value sits in the card; missing means center
     */
    valign?: string;
    /**
     * TextDisplay: fixed text shown instead of a tag value
     */
    staticText?: string;
    /**
     * LED color when false
     */
    falseColor?: string;
    /**
     * LED text when false
     */
    falseLabel?: string;
    /**
     * LED color when true
     */
    trueColor?: string;
    /**
     * LED text when true
     */
    trueLabel?:  string;
    btnColor?:   ButtonColor;
    btnRounded?: ButtonRounded;
    btnVariant?: ButtonVariant;
    /**
     * Button icon (emoji or short text)
     */
    icon?: string;
    /**
     * Toggle button color when off
     */
    toggleOffColor?: string;
    /**
     * Toggle button color when on
     */
    toggleOnColor?: string;
    /**
     * Setpoint slider step
     */
    step?: number;
    /**
     * MultiState value→label→color map
     */
    states?: StateEntry[];
    /**
     * fit (follow the visible data) | nice (follow it, rounded to tidy numbers) | fixed (use
     * min and max, or each pen's yMin and yMax); missing means fit when no limits are set, else
     * fixed
     */
    autoscale?: string;
    /**
     * Trend history window in seconds
     */
    duration?: number;
    /**
     * false starts the trend paused; missing means running
     */
    live?: boolean;
    /**
     * Trend horizontal reference lines
     */
    refLines?: RefLine[];
    /**
     * Missing means shown
     */
    showGrid?: boolean;
    /**
     * Missing means shown
     */
    showLegend?: boolean;
    /**
     * Window, pause and history buttons; missing means shown
     */
    showToolbar?: boolean;
    /**
     * Trend multi-series config
     */
    tags?: TrendSeries[];
    /**
     * Seconds of each window button; missing means 30, 60, 300 and 3600
     */
    windows?: number[];
    xFormat?: TrendXFormat;
    /**
     * HistoryLog rows per page
     */
    pageSize?: number;
    /**
     * AlarmBanner max visible rows
     */
    maxRows?: number;
    /**
     * AlarmBanner: show acknowledged alarms
     */
    showAcked?: boolean;
    /**
     * Image object-fit, as set by the properties panel
     */
    fit?: ImageFit;
    /**
     * Image: data-URL, URL or 'lib:<imageId>'
     */
    src?: string;
    /**
     * Symbol: true while the symbol should move (a pump running); drive it from a tag
     */
    animate?: boolean;
    /**
     * Symbol: seconds for one turn or one pulse; missing means 2
     *
     * Pipe: seconds for the dashes to move one step; missing means 1
     */
    cycleSeconds?: number;
    /**
     * Symbol: what it does while animate is true
     */
    motion?: SymbolMotion;
    /**
     * Symbol: stroke color
     */
    stroke?: string;
    /**
     * Symbol: id from a symbol pack
     */
    symbolId?: string;
    /**
     * Pipe: the pipe's color, a CSS color or a token such as token:process-running
     */
    color?: string;
    /**
     * Pipe: true while something flows; drive it from a tag
     */
    flow?: boolean;
    /**
     * Pipe: the color of the moving dashes; missing means the theme's own
     */
    flowColor?: string;
    /**
     * Pipe: the corners as x,y pairs from 0 to 100 across the widget, e.g. "0,50 60,50 60,100"
     */
    points?: string;
    /**
     * Pipe: flow runs from the last point to the first
     */
    reverse?: boolean;
    /**
     * Pipe: line width in pixels; missing means 8
     */
    weight?: number;
    /**
     * Custom widget: id of the custom widget to show
     */
    customWidgetId?: string;
    /**
     * Custom widget: parameter name → binding
     */
    params?: { [key: string]: string };
    /**
     * list: show each page group's heading (default true)
     */
    showGroups?: boolean;
    /**
     * list: icon and name down the side, grouped; tabs: names in a row; icons: large icon
     * buttons in a row; bar: icon over name, sharing the width
     */
    style?: Style;
    /**
     * What to show; missing means timeSeconds
     */
    format?: Format;
    /**
     * 12-hour clock instead of 24-hour
     */
    hour12?: boolean;
    /**
     * Put the weekday first (default true)
     */
    showWeekday?: boolean;
    /**
     * One summary (2/3) instead of a chip for each datasource
     */
    compact?: boolean;
    /**
     * Show the signed-in name beside the icon
     */
    showName?: boolean;
    /**
     * Show only this recipe; missing shows every recipe
     */
    recipeId?: string;
    /**
     * List each recipe's tags and values (default true)
     */
    showEntries?: boolean;
    /**
     * Table widget rows
     */
    rows?: TableRow[];
    [property: string]: any;
}

export interface Preset {
    description?: string;
    id:           string;
    name:         string;
    /**
     * Ordinary widgets; x and y are relative to the preset's top-left corner, ids are replaced
     * on insert
     */
    widgets: Widget[];
}

export interface Recipe {
    description?: string;
    entries:      RecipeEntry[];
    id:           string;
    name:         string;
}

export interface RecipeEntry {
    /**
     * datasource_id:tag_path
     */
    binding: string;
    value:   any;
}

/**
 * The role runtime scripts write as (roles and limits apply, and the audit names the
 * script); missing means operator
 */
export type Role = "operator" | "supervisor" | "engineer" | "admin";

/**
 * JavaScript the runtime runs in its own sandbox, writing through the write pipeline as
 * scriptRole, and only to the tags in its writes list
 */
export interface RuntimeScript {
    id:   string;
    name: string;
    /**
     * JavaScript (the script API: readTag, writeTag, onChange, every, after, log, emit, alarms)
     */
    source:  string;
    trigger: ScriptTrigger;
    /**
     * The tags the script may write: datasource:path, ns:path, or a prefix ending in * (mem:*,
     * ns:Line1/*). A listed tag needs no widget; a script without the list writes nothing
     */
    writes?: string[];
}

/**
 * When a runtime script runs; it can name several
 */
export interface ScriptTrigger {
    /**
     * Run every this many milliseconds
     */
    every?: number;
    /**
     * Alarm rule ids: run when one raises or clears
     */
    onAlarm?: string[];
    /**
     * Tag paths (ds:path or ns:path): run when one changes
     */
    onChange?: string[];
    /**
     * Run once when the project starts
     */
    onStart?: boolean;
}

/**
 * Login settings. Missing means mode 'none'. Users live on the runtime (security.db), not
 * in the project
 */
export interface Security {
    mode: AuthMode;
}

/**
 * none: no login, anyone who reaches the runtime can read and write. login: every user must
 * log in
 */
export type AuthMode = "none" | "login";

/**
 * A typed value kept per browser tab, read as {session:name}
 */
export interface SessionVar {
    /**
     * The value when the tab opens; missing means false, 0 or empty text
     */
    initial?: boolean | number | string;
    /**
     * Letters, digits and _
     */
    name: string;
    type: Type;
}

/**
 * The frame around the pages in the operator screen
 */
export interface Shell {
    /**
     * builtin (the default) draws the operator's own top bar and navigation; custom draws the
     * frame slots instead
     */
    chrome?: Chrome;
    /**
     * With chrome custom: custom widgets pinned to the edges of every page, drawn around the
     * page
     */
    frame?: FrameSlot[];
    nav?:   ShellNav;
}

/**
 * builtin (the default) draws the operator's own top bar and navigation; custom draws the
 * frame slots instead
 */
export type Chrome = "builtin" | "custom";

/**
 * A custom widget pinned to an edge of the screen, with the page drawn in the room that is
 * left. A smaller screen can move it to another edge or give it another size
 */
export interface FrameSlot {
    customWidgetId: string;
    /**
     * Screen sizes it is drawn on; missing means all
     */
    devices?: Device[];
    edge:     FrameEdge;
    id:       string;
    /**
     * Parameter name to binding, as on a custom widget placed on a page
     */
    params?: { [key: string]: string };
    phone?:  FrameSlotOverride;
    /**
     * Pixels high for a top or bottom edge, wide for a left or right edge
     */
    size:    number;
    tablet?: FrameSlotOverride;
}

export type Device = "desktop" | "tablet" | "phone";

export type FrameEdge = "top" | "right" | "bottom" | "left";

/**
 * What differs on a smaller screen; a phone inherits from the tablet and the tablet from
 * the desktop
 */
export interface FrameSlotOverride {
    edge?: FrameEdge;
    size?: number;
}

/**
 * How a person moves between pages: a list on the left, a row of large icon buttons, or
 * tabs. A phone always gets a bar along the bottom. Missing means tabs
 */
export type ShellNav = "sidebar" | "toolbar" | "tabs";

/**
 * The look of every screen: a preset, light or dark, and any element changed from the
 * preset. A browser can still pick light or dark for itself; that choice is not saved in
 * the project
 *
 * A preset sets every element; an element named here replaces the preset's choice, so a
 * theme can be taken whole or built from its parts
 */
export interface Theme {
    /**
     * The main color of buttons and selections as #rrggbb; replaces the palette's
     */
    accent?:  string;
    corners?: ThemeCorners;
    density?: ThemeDensity;
    depth?:   ThemeDepth;
    font?:    ThemeFont;
    mode?:    ThemeMode;
    palette?: ThemePalette;
    preset?:  ThemePreset;
}

/**
 * Corner radius of cards and controls: 2, 6 or 12 px
 */
export type ThemeCorners = "square" | "soft" | "round";

/**
 * Padding and text size. touch is larger, with controls at least 44 px tall, for tablets
 * and panels
 */
export type ThemeDensity = "compact" | "comfortable" | "touch";

/**
 * flat: a 1 px border. raised: a soft shadow. borderless: neither, the cards stand out by
 * color alone
 */
export type ThemeDepth = "flat" | "raised" | "borderless";

/**
 * The text font. All but system are bundled, so a PLC with no internet shows the same text
 */
export type ThemeFont = "inter" | "roboto" | "open-sans" | "noto-sans" | "system";

/**
 * Missing means the preset's own (light for calm and clean, dark for modern)
 */
export type ThemeMode = "light" | "dark";

/**
 * The colors: calm is gray with a muted blue; modern is cool white or charcoal with a
 * bright blue
 */
export type ThemePalette = "calm" | "modern";

/**
 * calm: ISA-101 gray, flat, square corners, color only for abnormal states. clean: white
 * cards, soft depth, round corners. modern: charcoal, soft corners, borders instead of
 * shadows. Missing means calm
 */
export type ThemePreset = "calm" | "clean" | "modern";

export interface Udt {
    description?: string;
    fields:       UDTField[];
    id:           string;
    name:         string;
}

export interface UDTField {
    description?: string;
    name:         string;
    type:         Type;
    unit?:        string;
}
