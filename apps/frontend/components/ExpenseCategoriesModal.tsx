"use client";

import type { ExpenseCategoryDto } from "@ebay-order-management/shared";
import { CheckOutlined, CloseOutlined, PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Empty, Input, Modal, Space } from "antd";
import { useState } from "react";
import { DeleteAction, EditAction } from "@/components/RowActions";
import { createExpenseCategory, deleteExpenseCategory, renameExpenseCategory } from "@/lib/api";

/** Admin only: add, rename and remove expense categories. Removing one keeps its expenses, without a category. */
export default function ExpenseCategoriesModal({
  open,
  categories,
  onClose,
  onChange,
}: {
  open: boolean;
  categories: ExpenseCategoryDto[];
  onClose: () => void;
  onChange: (next: ExpenseCategoryDto[]) => void;
}) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<ExpenseCategoryDto[]>) {
    setBusy(true);
    setError(null);
    try {
      onChange(await action());
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!newName.trim()) return;
    if (await run(() => createExpenseCategory(newName.trim()))) setNewName("");
  }

  async function saveRename(id: string) {
    if (!editName.trim()) return;
    if (await run(() => renameExpenseCategory(id, editName.trim()))) setEditingId(null);
  }

  return (
    <Modal open={open} title="Expense categories" footer={<Button onClick={onClose}>Done</Button>} onCancel={onClose}>
      {error && <Alert type="error" title={error} className="mb-4" showIcon />}
      <Space.Compact className="mb-4 w-full">
        <Input
          placeholder="New category, e.g. Rent"
          maxLength={60}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onPressEnter={add}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={add} loading={busy} disabled={!newName.trim()}>
          Add
        </Button>
      </Space.Compact>

      {categories.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No categories yet" />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-1.5">
              {editingId === c.id ? (
                <>
                  <Input
                    size="small"
                    maxLength={60}
                    value={editName}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    onPressEnter={() => saveRename(c.id)}
                  />
                  <Button type="text" size="small" icon={<CheckOutlined />} aria-label="Save" onClick={() => saveRename(c.id)} />
                  <Button type="text" size="small" icon={<CloseOutlined />} aria-label="Cancel" onClick={() => setEditingId(null)} />
                </>
              ) : (
                <>
                  <span className="truncate">{c.name}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    <EditAction
                      title="Rename"
                      onClick={() => {
                        setEditingId(c.id);
                        setEditName(c.name);
                      }}
                    />
                    <DeleteAction
                      confirmTitle={`Remove "${c.name}"? Its expenses keep their amounts, without a category.`}
                      onConfirm={() => run(() => deleteExpenseCategory(c.id))}
                    />
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
