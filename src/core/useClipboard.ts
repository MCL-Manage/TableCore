type ClipboardHandlers = {
  onCopyText: () => string | undefined;
  onPasteMatrix: (matrix: string[][]) => void;
  onUndo: () => void;
  onRedo: () => void;
};

export function useClipboard(handlers: ClipboardHandlers) {
  function parseTSV(text: string): string[][] {
    // Støtt både \r\n og \n
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.length || text.endsWith('\n'));
    return lines.map(line => line.split('\t'));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const isMac = /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);
    const ctrl = isMac ? e.metaKey : e.ctrlKey;

    // Undo/Redo
    if (ctrl && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      handlers.onUndo();
      return;
    }
    if (ctrl && (e.key === 'y' || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
      e.preventDefault();
      handlers.onRedo();
      return;
    }
  }

  function onCopy(e: React.ClipboardEvent) {
    const text = handlers.onCopyText?.();
    if (!text) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', text);
    e.clipboardData.setData('text/tab-separated-values', text);
  }

  function onPaste(e: React.ClipboardEvent) {
    const plain = e.clipboardData.getData('text/plain') || '';
    if (!plain) return;
    e.preventDefault();
    const matrix = parseTSV(plain);
    handlers.onPasteMatrix(matrix);
  }

  return { onKeyDown, onCopy, onPaste };
}
