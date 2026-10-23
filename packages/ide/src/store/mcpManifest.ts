import type { Project } from "./projectStore";

export function generateMCPManifest(project: Project): object {
  return {
    name: "x-hmi",
    version: "1.0",
    description: `Speth's Screens project: ${project.name ?? "Untitled"}`,
    resources: [
      { uri: "xhmi://project",    name: "Project metadata",   mimeType: "application/json" },
      { uri: "xhmi://pages",      name: "Pages list",          mimeType: "application/json" },
      ...project.pages.map((p) => ({
        uri: `xhmi://page/${p.id}`,
        name: `Page: ${p.name}`,
        mimeType: "application/json",
      })),
      { uri: "xhmi://tags",    name: "Live tag values",  mimeType: "application/json" },
      { uri: "xhmi://alarms",  name: "Active alarms",    mimeType: "application/json" },
      { uri: "xhmi://recipes", name: "Recipes",          mimeType: "application/json" },
      { uri: "xhmi://assets",  name: "Asset model",      mimeType: "application/json" },
    ],
    tools: [
      {
        name: "navigatePage",
        description: "Navigate the HMI to a specific page",
        inputSchema: {
          type: "object",
          properties: {
            pageId:   { type: "string", description: "Page ID" },
            pageName: { type: "string", description: "Page name (alternative to ID)" },
          },
        },
      },
      {
        name: "writeTag",
        description: "Write a value to a tag binding",
        inputSchema: {
          type: "object",
          required: ["binding", "value"],
          properties: {
            binding: { type: "string", description: "Tag binding, e.g. rest:Racks[0].Temperature" },
            value:   { description: "Value to write" },
          },
        },
      },
      {
        name: "applyRecipe",
        description: "Apply a saved recipe (write all its tag values)",
        inputSchema: {
          type: "object",
          required: ["recipeId"],
          properties: {
            recipeId: { type: "string", description: "Recipe ID" },
          },
        },
      },
      {
        name: "acknowledgeAlarm",
        description: "Acknowledge an active alarm by rule ID",
        inputSchema: {
          type: "object",
          required: ["ruleId"],
          properties: {
            ruleId: { type: "string", description: "Alarm rule ID" },
          },
        },
      },
    ],
    _projectSummary: {
      pageCount:      project.pages.length,
      datasourceCount: project.datasources.length,
      alarmRuleCount: project.alarmRules?.length ?? 0,
      recipeCount:    project.recipes?.length ?? 0,
    },
  };
}
