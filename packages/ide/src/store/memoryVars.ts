// Memory variables: typed values the runtime holds for scripts and screens (a "memory" datasource). The project
// defines them in the datasource's `memoryTags`, and a namespace node names each one. These helpers make both
// together, so a variable made in the namespace is also a memory tag of the right type.
import type { Datasource, MemoryTag, NamespaceNode, Project, Type } from "@speths-screens/shared-types";

export const MEMORY_TYPES: readonly Type[] = ["bool", "int", "real", "string"];

/** The namespace's data type for a memory tag's type. */
export const NS_DATA_TYPE: Record<Type, string> = { bool: "bool", int: "int", real: "float", string: "string" };

export const isMemoryDatasource = (ds: { type: string }): boolean => ds.type === "memory";

/** The memory tags a datasource has in the project. */
export function memoryTagsOf(ds: Pick<Datasource, "config">): MemoryTag[] {
  return ((ds.config as { memoryTags?: MemoryTag[] } | undefined)?.memoryTags) ?? [];
}

export type MemoryVariable = {
  /** The memory datasource that holds it. */
  dsId: string;
  tag: MemoryTag;
};

export type Added = { project: Project; error?: undefined } | { project?: undefined; error: string };

/**
 * The project with `node` in its namespace and, unless the datasource already has a tag of that name, `variable.tag` in the
 * datasource's memory tags. Says why not when the node's path is taken or the datasource is not a memory datasource.
 */
export function addMemoryVariable(project: Project, node: NamespaceNode, variable: MemoryVariable): Added {
  const ds = project.datasources.find((d) => d.id === variable.dsId);
  if (!ds) return { error: `there is no datasource ${variable.dsId}` };
  if (!isMemoryDatasource(ds)) return { error: `${ds.label || ds.id} is not a memory datasource` };
  if ((project.namespace ?? []).some((n) => n.path === node.path)) return { error: `ns:${node.path} already exists` };
  const have = memoryTagsOf(ds);
  const tags = have.some((t) => t.path === variable.tag.path) ? have : [...have, variable.tag];
  return {
    project: {
      ...project,
      datasources: project.datasources.map((d) => (d.id === ds.id ? { ...d, config: { ...d.config, memoryTags: tags } } : d)),
      namespace: [...(project.namespace ?? []), node],
    },
  };
}
