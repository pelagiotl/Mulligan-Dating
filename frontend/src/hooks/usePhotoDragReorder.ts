import { useCallback, useState } from "react";

type ItemWithId = { id: string };

export function usePhotoDragReorder<T extends ItemWithId>({
  items,
  onReorder,
  disabled = false,
}: {
  items: T[];
  onReorder: (photoIds: string[]) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent, id: string) => {
      if (disabled) return;
      setDraggingId(id);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
    },
    [disabled]
  );

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverId(null);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, id: string) => {
      if (disabled || !draggingId || draggingId === id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverId(id);
    },
    [disabled, draggingId]
  );

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      if (disabled) return;
      const sourceId = e.dataTransfer.getData("text/plain") || draggingId;
      setDraggingId(null);
      setDragOverId(null);
      if (!sourceId || sourceId === targetId) return;

      const order = [...items];
      const fromIdx = order.findIndex((p) => p.id === sourceId);
      const toIdx = order.findIndex((p) => p.id === targetId);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;

      const next = [...order];
      const [removed] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, removed);
      await onReorder(next.map((p) => p.id));
    },
    [disabled, draggingId, items, onReorder]
  );

  const getDragItemClassName = useCallback(
    (id: string, baseClass: string) => {
      const parts = [baseClass];
      if (draggingId === id) parts.push("is-dragging");
      if (dragOverId === id && draggingId !== id) parts.push("is-drag-over");
      return parts.join(" ");
    },
    [draggingId, dragOverId]
  );

  return {
    draggingId,
    dragOverId,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    getDragItemClassName,
  };
}
