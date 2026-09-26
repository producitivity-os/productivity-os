import type { WorkflowSubtask } from "../index.ts";

export class WorkflowTaskLayout {
  readonly horizontalPadding = 18;
  readonly subtaskLabelX = 40;
  readonly checkboxSize = 16;
  readonly rowHeight = 24;
  readonly collapsedHeight = 52;

  standaloneCheckboxBounds(height: number): { x: number; y: number; width: number; height: number } {
    const size = 20;
    return { x: 16, y: height / 2 - size / 2, width: size, height: size };
  }

  minimumHeightFor(subtaskCount: number): number {
    return Math.max(56, 48 + Math.max(0, subtaskCount) * this.rowHeight);
  }

  titleY(height: number, subtaskCount: number): number {
    return subtaskCount > 0 ? 21 : height / 2;
  }

  subtaskCenterY(index: number): number {
    return 52 + index * this.rowHeight;
  }

  collapseBounds(width: number): { x: number; y: number; width: number; height: number } {
    return { x: width - 34, y: 6, width: 26, height: 30 };
  }

  addBounds(width: number, hasSubtasks: boolean): { x: number; y: number; width: number; height: number } {
    return {
      x: width - (hasSubtasks ? 62 : 34),
      y: 6,
      width: 26,
      height: 30,
    };
  }

  checkboxBounds(index: number): { x: number; y: number; width: number; height: number } {
    return {
      x: 16,
      y: this.subtaskCenterY(index) - this.checkboxSize / 2,
      width: this.checkboxSize,
      height: this.checkboxSize,
    };
  }

  completed(subtasks: readonly WorkflowSubtask[], standaloneCompleted: boolean): boolean {
    return subtasks.length > 0 ? subtasks.every((subtask) => subtask.completed) : standaloneCompleted;
  }
}

export const workflowTaskLayout = new WorkflowTaskLayout();
