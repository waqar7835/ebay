"use client";

import type { ProfitShareRowDto } from "@ebay-order-management/shared";
import { Table, Tag, Tooltip, type TableColumnsType } from "antd";
import { pkr } from "@/lib/currency";
import { formatDate } from "@/lib/date";

const KIND_TAG: Record<ProfitShareRowDto["kind"], { label: string; color: string }> = {
  COMPANY: { label: "Company", color: "blue" },
  ADMIN: { label: "Admin", color: "purple" },
  PARTNER: { label: "Partner", color: "green" },
};

/** Red for anything below zero, as on invoices. */
export function SignedPkr({ value, bold }: { value: number; bold?: boolean }) {
  return <span className={`${value < 0 ? "text-red-600" : ""} ${bold ? "font-semibold" : ""}`}>{pkr(value)}</span>;
}

/**
 * The profit split for one billing cycle: each person's % → profit share − expenses = net in hand. The company row also
 * carries the previous cycle's balance. Rows with expenses expand to list them.
 */
export default function ProfitShareTable({ shares, compact }: { shares: ProfitShareRowDto[]; compact?: boolean }) {
  const columns: TableColumnsType<ProfitShareRowDto> = [
    {
      title: "Name",
      key: "name",
      render: (_, row) => (
        <span className="flex items-center gap-2">
          <span className="font-medium">{row.name}</span>
          <Tag color={KIND_TAG[row.kind].color} className="m-0">
            {KIND_TAG[row.kind].label}
          </Tag>
        </span>
      ),
    },
    { title: "Share", dataIndex: "percent", align: "right", render: (v: number) => `${v}%` },
    { title: "Profit share", dataIndex: "share", align: "right", render: (v: number) => <SignedPkr value={v} /> },
    {
      title: "Expenses",
      dataIndex: "expenses",
      align: "right",
      render: (v: number) => (v ? <SignedPkr value={-v} /> : <span className="text-slate-400">—</span>),
    },
    ...(compact
      ? []
      : [
          {
            title: (
              <Tooltip title="Company only: its net in hand at the end of the previous cycle (or the opening balance)">
                Brought forward
              </Tooltip>
            ),
            dataIndex: "broughtForward",
            align: "right" as const,
            render: (v: number | null) => (v === null ? <span className="text-slate-400">—</span> : <SignedPkr value={v} />),
          },
        ]),
    {
      title: "Net in hand",
      dataIndex: "netInHand",
      align: "right",
      render: (v: number) => <SignedPkr value={v} bold />,
    },
  ];

  return (
    <Table<ProfitShareRowDto>
      rowKey={(row) => row.userId ?? "company"}
      size="small"
      pagination={false}
      columns={columns}
      dataSource={shares}
      expandable={
        compact
          ? undefined
          : {
              rowExpandable: (row) => row.expenseLines.length > 0,
              expandedRowRender: (row) => (
                <ul className="m-0 list-none space-y-1 p-0 text-sm">
                  {row.expenseLines.map((e) => (
                    <li key={e.id} className="flex flex-wrap justify-between gap-3">
                      <span>
                        <span className="text-slate-500">{formatDate(e.expenseDate)}</span> · {e.title}
                        {e.categoryName && <Tag className="ml-2">{e.categoryName}</Tag>}
                      </span>
                      <SignedPkr value={-e.amount} />
                    </li>
                  ))}
                </ul>
              ),
            }
      }
    />
  );
}
