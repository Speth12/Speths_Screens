/**
 * Runtime project file — single source of truth. Generated types: internal/project/types.go
 * + packages/shared-types/src/project.ts
 */
export interface NamespaceNode {
    path:        string;
    type:        "folder" | "asset" | "tag" | "virtual";
    dataType?:   string;
    description?: string;
    unit?:       string;
    driverId?:   string;
    driverAddr?: string;
    expression?: string;
    meta?:       Record<string, string>;
}

export interface Project {
    alarmRules?: AlarmRuleElement[];
    datasources: DatasourceElement[];
    /**
     * Human-readable project name
     */
    name?: string;
    /**
     * Unified Namespace — flat list of namespace nodes (folders, assets, tags).
     * Tags with driverId+driverAddr are bound to a live data source.
     */
    namespace?: NamespaceNode[];
    pages: PageElement[];
    /**
     * Operator PIN — operator panel locks behind this if set
     */
    pin?:     string;
    recipes?: RecipeElement[];
    /**
     * Schema version, e.g. '0.1.0'
     */
    version: string;
    /**
     * Disable all write widgets in the operator panel
     */
    viewOnly?: boolean;
}

export interface AlarmRuleElement {
    /**
     * datasource_id:tag_path, e.g. 'opcua:ns=2;s=PLCnext.pressure'
     */
    binding:   string;
    condition: Condition;
    id:        string;
    message:   string;
    name:      string;
    severity:  Severity;
    threshold: number;
}

export enum Condition {
    Eq = "eq",
    Gt = "gt",
    Gte = "gte",
    LTE = "lte",
    Lt = "lt",
    Ne = "ne",
}

export enum Severity {
    Critical = "critical",
    Info = "info",
    Warning = "warning",
}

export interface DatasourceElement {
    config: ConfigClass;
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
export interface ConfigClass {
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

export enum SecurityMode {
    None = "None",
    Sign = "Sign",
    SignAndEncrypt = "SignAndEncrypt",
}

export enum SecurityPolicy {
    Basic128Rsa15 = "Basic128Rsa15",
    Basic256 = "Basic256",
    Basic256Sha256 = "Basic256Sha256",
    None = "None",
}

export enum DatasourceType {
    Mbtcp = "mbtcp",
    Mqtt = "mqtt",
    Opcua = "opcua",
    REST = "rest",
    Virtual = "virtual",
}

export interface PageElement {
    id:      string;
    name:    string;
    widgets: WidgetElement[];
}

export interface WidgetElement {
    /**
     * datasource_id:tag_path, e.g. 'opcua:ns=2;s=PLCnext.iTest'
     */
    binding?: string;
    config?:  ConfigObject;
    /** Widget dynamics (visibility, opacity, color, script). */
    dynamics?: unknown[];
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

/**
 * Per-widget configuration. Fields depend on type.
 */
export interface ConfigObject {
    /**
     * Button action type
     */
    action?: Action;
    /**
     * Tag path for color threshold evaluation
     */
    colorBinding?: string;
    /**
     * Color threshold rules applied to colorBinding
     */
    colorThresholds?: ColorThresholdElement[];
    /**
     * Trend history window in seconds
     */
    duration?: number;
    /**
     * LED color when false
     */
    falseColor?: string;
    /**
     * Image object-fit
     */
    fit?: Fit;
    /**
     * printf-style format, e.g. '%.2f'
     */
    format?: string;
    label?:  string;
    max?:    number;
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
     * Trend horizontal reference lines
     */
    refLines?: RefLineElement[];
    /**
     * AlarmBanner: show acknowledged alarms
     */
    showAcked?: boolean;
    /**
     * Image: data-URL or URL
     */
    src?: string;
    /**
     * MultiState value→label→color map
     */
    states?: StateElement[];
    /**
     * Setpoint slider step
     */
    step?: number;
    /**
     * Trend multi-series config
     */
    tags?:       TagElement[];
    thresholds?: ColorThresholdElement[];
    /**
     * LED color when true
     */
    trueColor?: string;
    unit?:      string;
    /**
     * Trend X-axis label format
     */
    xFormat?: XFormat;
    [property: string]: any;
}

/**
 * Button action type
 */
export enum Action {
    Navigate = "navigate",
    Write = "write",
}

export interface ColorThresholdElement {
    /**
     * CSS color, e.g. '#22c55e'
     */
    color: string;
    /**
     * Optional upper bound (exclusive). If set, threshold matches value >= this.value && value < toValue.
     * If absent, matches value >= this.value (open-ended, highest match wins).
     */
    toValue?: number;
    value:    number;
}

/**
 * Image object-fit
 */
export enum Fit {
    Contain = "contain",
    Cover = "cover",
    Fill = "fill",
}

export interface RefLineElement {
    color:  string;
    label?: string;
    value:  number;
}

export interface StateElement {
    color:      string;
    label:      string;
    textColor?: string;
    value:      any;
}

export interface TagElement {
    binding: string;
    color:   string;
    fill?:   boolean;
    label?:  string;
    yMax?:   number;
    yMin?:   number;
}

/**
 * Trend X-axis label format
 */
export enum XFormat {
    Datetime = "datetime",
    Relative = "relative",
    Time = "time",
    TimeShort = "time-short",
}

export enum WidgetType {
    AlarmBanner = "alarmBanner",
    Button = "button",
    Gauge = "gauge",
    HistoryLog = "historyLog",
    Image = "image",
    LED = "led",
    MultiState = "multiState",
    NumericDisplay = "numericDisplay",
    NumericInput = "numericInput",
    Setpoint = "setpoint",
    Tank = "tank",
    TextDisplay = "textDisplay",
    TextInput = "textInput",
    Trend = "trend",
}

export interface RecipeElement {
    description?: string;
    entries:      EntryElement[];
    id:           string;
    name:         string;
}

export interface EntryElement {
    /**
     * datasource_id:tag_path
     */
    binding: string;
    value:   any;
}
