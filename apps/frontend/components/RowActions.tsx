"use client";

import { CheckCircleOutlined, DeleteOutlined, EditOutlined, StopOutlined, UndoOutlined } from "@ant-design/icons";
import { Button, Popconfirm, Tooltip } from "antd";

/** Icon-only row actions for tables. Destructive ones always go through a Popconfirm. */
export function EditAction({
  onClick,
  title = "Edit",
  disabled,
  disabledReason,
}: {
  onClick: () => void;
  title?: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <Tooltip title={disabled && disabledReason ? disabledReason : title}>
      <Button
        type="text"
        size="small"
        icon={<EditOutlined />}
        onClick={onClick}
        aria-label={title}
        disabled={disabled}
      />
    </Tooltip>
  );
}

export function DeleteAction({ onConfirm, confirmTitle, title = "Delete" }: { onConfirm: () => void; confirmTitle: string; title?: string }) {
  return (
    <Popconfirm title={confirmTitle} okText="Delete" okButtonProps={{ danger: true }} onConfirm={onConfirm}>
      <Tooltip title={title}>
        <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={title} />
      </Tooltip>
    </Popconfirm>
  );
}

/** Undo-arrow icon that puts something back to its original settings, after a confirm. */
export function ResetAction({ onConfirm, confirmTitle, title = "Reset" }: { onConfirm: () => void; confirmTitle: string; title?: string }) {
  return (
    <Popconfirm title={confirmTitle} okText="Reset" okButtonProps={{ danger: true }} onConfirm={onConfirm}>
      <Tooltip title={title}>
        <Button type="text" size="small" icon={<UndoOutlined />} aria-label={title} />
      </Tooltip>
    </Popconfirm>
  );
}

/** Disable (red stop icon) when active, Enable (green check) otherwise; both confirm first. */
export function ToggleStatusAction({ active, name, onConfirm }: { active: boolean; name: string; onConfirm: () => void }) {
  const title = active ? "Disable" : "Enable";
  return (
    <Popconfirm
      title={`${title} ${name}?`}
      okText={title}
      okButtonProps={{ danger: active }}
      onConfirm={onConfirm}
    >
      <Tooltip title={title}>
        <Button
          type="text"
          size="small"
          danger={active}
          icon={active ? <StopOutlined /> : <CheckCircleOutlined className="text-emerald-600" />}
          aria-label={title}
        />
      </Tooltip>
    </Popconfirm>
  );
}
