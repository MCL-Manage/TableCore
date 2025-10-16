export type CellChange = {
  rowId: string;
  colId: string;
  oldValue: any;
  nextValue: any;
};

export type HistoryAction = {
  changes: CellChange[]; // én eller mange
};

export function useUndoRedo() {
  const undoStack = React.useRef<HistoryAction[]>([]);
  const redoStack = React.useRef<HistoryAction[]>([]);

  function push(action: HistoryAction) {
    undoStack.current.push(action);
    // ny endring invaliderer redo-kjeden
    redoStack.current = [];
  }

  function undo(): HistoryAction | null {
    const a = undoStack.current.pop();
    if (!a) return null;
    redoStack.current.push(a);
    return a;
  }

  function redo(): HistoryAction | null {
    const a = redoStack.current.pop();
    if (!a) return null;
    undoStack.current.push(a);
    return a;
  }

  return { push, undo, redo };
}

// Import React uten default for å unngå treeshake-problemer i noen bundlere
import * as React from 'react';
