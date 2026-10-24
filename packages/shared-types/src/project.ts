/**
 * Speth's Screens project file — single source of truth. Generated types:
 * internal/project/types.go + packages/shared-types/src/project.ts
 */
export interface Project {
    alarmRules?:       AlarmRule[];
    assets?:           AssetNode[];
    canvasResolution?: CanvasResolution;
    canvasSnap?:       CanvasSnap;
    datasources:       Datasource[];
    /**
     * Symbol pack ids shown in the IDE symbol library. Missing means all packs
     */
    enabledSymbolPacks?: string[];
    faceplates?:         Faceplate[];
    /**
     * What the historian stores and for how long. Missing means every change, plus one sample
     * per tag every 60 s, kept for the runtime's --history-retention (default 7 days)
     */
    historian?: HistorianSettings;
    images?:    ImageAsset[];
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
    pin?:     string;
    recipes?: Recipe[];
    /**
     * Login settings. Missing means mode 'none'. Users live on the runtime (security.db), not
     * in the project
     */
    security?: Security;
    /**
     * Default theme for every screen. A browser can still pick its own; that choice is not
     * saved in the project
     */
    theme?: ThemeID;
    udts?:  Udt[];
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
     * datasource_id:tag_path, e.g. 'opcua:ns=2;s=PLCnext.pressure'
     */
    binding:   string;
    condition: AlarmCondition;
    id:        string;
    message:   string;
    name:      string;
    severity:  AlarmSeverity;
    threshold: number;
}

export type AlarmCondition = "gt" | "gte" | "lt" | "lte" | "eq" | "ne";

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
    host?:     string;
    password?: string;
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
     * Virtual driver: JSON-encoded [{path,formula}...] array
     */
    tags?:     string;
    username?: string;
}

export type SecurityMode = "None" | "Sign" | "SignAndEncrypt";

export type SecurityPolicy = "None" | "Basic128Rsa15" | "Basic256" | "Basic256Sha256";

export type DatasourceType = "opcua" | "mbtcp" | "mqtt" | "rest" | "virtual";

export interface Faceplate {
    description?: string;
    id:           string;
    name:         string;
    params:       FaceplateParam[];
    widgets:      FaceplateWidget[];
}

export interface FaceplateParam {
    description?: string;
    /**
     * Used as {name} in bindings inside the faceplate
     */
    name: string;
}

/**
 * A widget inside a faceplate. Same as Widget, but identified by localId
 */
export interface FaceplateWidget {
    /**
     * May contain {param} placeholders
     */
    binding?:        string;
    config?:         WidgetConfig;
    dynamics?:       Dynamic[];
    groupId?:        string;
    h:               number;
    localId:         string;
    locked?:         boolean;
    type:            WidgetType;
    visibleBinding?: string;
    w:               number;
    x:               number;
    y:               number;
}

/**
 * Per-widget configuration. Fields depend on type.
 */
export interface WidgetConfig {
    action?:      ButtonAction;
    bgColor?:     string;
    borderColor?: string;
    btnColor?:    ButtonColor;
    btnRounded?:  ButtonRounded;
    btnVariant?:  ButtonVariant;
    /**
     * Tag path for color threshold evaluation
     */
    colorBinding?: string;
    /**
     * Color threshold rules applied to colorBinding
     */
    colorThresholds?: Threshold[];
    /**
     * Decimal places. Found in existing projects; not read by either app yet
     */
    decimals?: number;
    /**
     * Trend history window in seconds
     */
    duration?: number;
    /**
     * Faceplate widget: id of the faceplate to show
     */
    faceplateId?: string;
    /**
     * LED color when false
     */
    falseColor?: string;
    /**
     * LED text when false
     */
    falseLabel?: string;
    /**
     * Image object-fit, as set by the properties panel
     */
    fit?:      ImageFit;
    fontBold?: boolean;
    /**
     * mono | sans | serif; empty means the theme font
     */
    fontFamily?: string;
    fontItalic?: boolean;
    /**
     * xs | sm | base | lg | xl | 2xl | 3xl | 4xl; empty means base
     */
    fontSize?:      string;
    fontUnderline?: boolean;
    /**
     * printf-style format, e.g. '%.2f'
     */
    format?: string;
    /**
     * Button icon (emoji or short text)
     */
    icon?:  string;
    label?: string;
    max?:   number;
    /**
     * AlarmBanner max visible rows
     */
    maxRows?: number;
    min?:     number;
    /**
     * Button: true=momentary, false=toggle
     */
    momentary?: boolean;
    /**
     * Button navigate: target page id
     */
    navigateTo?: string;
    noPadding?:  boolean;
    /**
     * Image object-fit, as set when dropped from the image library
     */
    objectFit?: ImageFit;
    /**
     * Button off/release value
     */
    offValue?: any;
    /**
     * Button on-press value
     */
    onValue?: any;
    /**
     * HistoryLog rows per page
     */
    pageSize?: number;
    /**
     * Faceplate widget: parameter name → binding
     */
    params?: { [key: string]: string };
    /**
     * TextInput/NumericInput placeholder
     */
    placeholder?: string;
    /**
     * Trend horizontal reference lines
     */
    refLines?: RefLine[];
    /**
     * Table widget rows
     */
    rows?: TableRow[];
    /**
     * AlarmBanner: show acknowledged alarms
     */
    showAcked?: boolean;
    /**
     * Show the tag quality indicator
     */
    showQuality?: boolean;
    /**
     * Image: data-URL, URL or 'lib:<imageId>'
     */
    src?: string;
    /**
     * MultiState value→label→color map
     */
    states?: StateEntry[];
    /**
     * TextDisplay: fixed text shown instead of a tag value
     */
    staticText?: string;
    /**
     * Setpoint slider step
     */
    step?: number;
    /**
     * Symbol: stroke color
     */
    stroke?: string;
    /**
     * Symbol: id from a symbol pack
     */
    symbolId?: string;
    /**
     * Trend multi-series config
     */
    tags?:       TrendSeries[];
    textAlign?:  TextAlign;
    textColor?:  string;
    thresholds?: Threshold[];
    /**
     * Toggle button color when off
     */
    toggleOffColor?: string;
    /**
     * Toggle button color when on
     */
    toggleOnColor?: string;
    /**
     * LED color when true
     */
    trueColor?: string;
    /**
     * LED text when true
     */
    trueLabel?: string;
    unit?:      string;
    xFormat?:   TrendXFormat;
    [property: string]: any;
}

export type ButtonAction = "write" | "navigate";

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
 *
 * Image object-fit, as set when dropped from the image library
 */
export type ImageFit = "contain" | "cover" | "fill";

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

export interface TrendSeries {
    binding: string;
    color:   string;
    fill?:   boolean;
    label?:  string;
    yMax?:   number;
    yMin?:   number;
}

export type TextAlign = "left" | "center" | "right";

/**
 * Trend X-axis label format
 */
export type TrendXFormat = "time" | "time-short" | "relative" | "datetime";

/**
 * A dynamic behavior on a widget. Which fields apply depends on kind
 */
export interface Dynamic {
    actionType?: DynamicActionType;
    /**
     * Tag the dynamic reacts to
     */
    binding?: string;
    /**
     * blink: flash color
     */
    blinkColor?: string;
    /**
     * blink: period in milliseconds
     */
    blinkPeriodMs?: number;
    /**
     * script: expression evaluated with `value` = tag value, e.g. 'value > 5000'
     */
    expression?: string;
    /**
     * colorFill: color when the tag is falsy
     */
    falseColor?: string;
    /**
     * script: applied to targetProp when the expression is falsy
     */
    falseValue?: string;
    id:          string;
    kind:        DynamicKind;
    /**
     * rotation: angle in degrees
     */
    maxAngle?: number;
    /**
     * rotation: tag value mapped to maxAngle
     */
    maxValue?: number;
    /**
     * rotation: angle in degrees
     */
    minAngle?: number;
    /**
     * rotation: tag value mapped to minAngle
     */
    minValue?: number;
    /**
     * navigate action: target page id
     */
    pageId?: string;
    /**
     * incrementValue action: amount to add
     */
    step?:       number;
    targetProp?: DynamicTargetProp;
    /**
     * colorFill: color when the tag is truthy
     */
    trueColor?: string;
    /**
     * script: applied to targetProp when the expression is truthy
     */
    trueValue?: string;
    /**
     * openUrl action: URL to open
     */
    url?: string;
    /**
     * Action: binding to write to (may differ from binding)
     */
    writeTo?: string;
    /**
     * writeValue action: value to write
     */
    writeValue?: any;
}

export type DynamicActionType = "writeValue" | "toggleValue" | "incrementValue" | "navigate" | "openUrl";

export type DynamicKind = "visibility" | "colorFill" | "blink" | "rotation" | "disable" | "onClick" | "onPressed" | "onReleased" | "script";

export type DynamicTargetProp = "bgColor" | "borderColor" | "textColor" | "visible";

export type WidgetType = "gauge" | "trend" | "led" | "button" | "numericInput" | "numericDisplay" | "textInput" | "textDisplay" | "historyLog" | "tank" | "setpoint" | "multiState" | "alarmBanner" | "image" | "symbol" | "faceplate" | "table";

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
    id:               string;
    name:             string;
    /**
     * Page script (JavaScript source)
     */
    script?: string;
    widgets: Widget[];
}

export interface Widget {
    /**
     * datasource_id:tag_path, e.g. 'opcua:ns=2;s=PLCnext.iTest'
     */
    binding?:  string;
    config?:   WidgetConfig;
    dynamics?: Dynamic[];
    /**
     * IDE-only: widgets with the same groupId move together
     */
    groupId?: string;
    /**
     * Height in grid units
     */
    h:  number;
    id: string;
    /**
     * IDE-only: widget cannot be moved or resized
     */
    locked?: boolean;
    type:    WidgetType;
    /**
     * BOOL tag — widget hidden when value is 0/false
     */
    visibleBinding?: string;
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
 * Default theme for every screen. A browser can still pick its own; that choice is not
 * saved in the project
 */
export type ThemeID = "scada-dark" | "blueprint" | "clean-room" | "brutalist" | "holographic" | "engineering-paper";

export interface Udt {
    description?: string;
    fields:       UDTField[];
    id:           string;
    name:         string;
}

export interface UDTField {
    description?: string;
    name:         string;
    type:         UDTFieldType;
    unit?:        string;
}

export type UDTFieldType = "bool" | "int" | "real" | "string";
