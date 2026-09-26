import type { WorkflowPluginNode } from "../index.ts";

type WorkflowPluginMigrator = (node: WorkflowPluginNode) => void;

let migrator: WorkflowPluginMigrator | null = null;

export function setWorkflowPluginMigrator(next: WorkflowPluginMigrator): void {
  migrator = next;
}

export function migrateWorkflowPluginNode(node: WorkflowPluginNode): void {
  migrator?.(node);
}
