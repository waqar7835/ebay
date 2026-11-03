"use client";

import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { ProductStockDto, ProductStockInput, UserDto } from "@ebay-order-management/shared";
import { Button, Form, InputNumber, Select, Tag } from "antd";
import { searchable, userNameOptions } from "@/lib/selectOptions";

/** One row of the product form's "stocks" Form.List: a 3PL and the units it holds. */
export interface StockRowValues {
  threePlId?: string;
  quantity?: number;
}

/** Form rows for a saved product's 3PLs (edit); a new product starts with one empty row. */
export function stockFormValues(stocks: ProductStockDto[] | undefined): StockRowValues[] {
  return stocks?.length ? stocks.map((s) => ({ threePlId: s.threePlId, quantity: s.quantity })) : [{ quantity: 0 }];
}

export function stockPayloads(rows: StockRowValues[]): ProductStockInput[] {
  return rows.filter((r) => r?.threePlId).map((r) => ({ threePlId: r.threePlId!, quantity: Number(r.quantity ?? 0) }));
}

/**
 * 3PLs a Stock product can be held at: active 3PLs set up for Stock fulfillment, plus any already on the product (so a
 * since-disabled one still shows by name).
 */
export function stockThreePls(users: UserDto[], keepIds: string[] = []): UserDto[] {
  return users.filter(
    (u) =>
      u.roles.includes("THREE_PL" as never) &&
      ((u.threePlProfile?.fulfillmentType === "STOCK" && u.status === "ACTIVE") || keepIds.includes(u.id)),
  );
}

interface ProductStockRowsProps {
  /** From stockThreePls(). */
  threePls: UserDto[];
  disabled?: boolean;
}

/**
 * The 3PLs holding a Stock product (decided 2026-11-03): one or more rows of 3PL + quantity, each 3PL once. Variations
 * share this list of 3PLs, each with its own quantities. Must sit inside the product's <Form> (values under `stocks`).
 */
export default function ProductStockRows({ threePls, disabled }: ProductStockRowsProps) {
  const form = Form.useFormInstance();
  const rows: StockRowValues[] = Form.useWatch("stocks", form) ?? [];
  const total = rows.reduce((sum, r) => sum + (Number(r?.quantity) || 0), 0);

  return (
    <Form.List
      name="stocks"
      rules={[
        {
          validator: (_, value?: StockRowValues[]) =>
            value?.some((r) => r?.threePlId) ? Promise.resolve() : Promise.reject(new Error("Add at least one 3PL")),
        },
      ]}
    >
      {(fields, { add, remove }, { errors }) => (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">3PL warehouses</span>
            <Tag className="mr-0">{`Total stock: ${total}`}</Tag>
          </div>
          {fields.map((field, index) => {
            const others = rows.map((r, i) => (i === index ? undefined : r?.threePlId)).filter(Boolean);
            return (
              <div key={field.key} className="flex items-start gap-3">
                <Form.Item
                  name={[field.name, "threePlId"]}
                  rules={[{ required: true, message: "Select a 3PL" }]}
                  className="mb-0 min-w-0 flex-1"
                >
                  <Select
                    showSearch={searchable}
                    placeholder="Select a 3PL…"
                    disabled={disabled}
                    options={userNameOptions(threePls.filter((u) => !others.includes(u.id)))}
                  />
                </Form.Item>
                <Form.Item name={[field.name, "quantity"]} rules={[{ required: true, message: "Qty" }]} className="mb-0 w-36">
                  <InputNumber precision={0} prefix="Qty" className="w-full" disabled={disabled} />
                </Form.Item>
                {fields.length > 1 && (
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => remove(field.name)}
                    disabled={disabled}
                    aria-label="Remove 3PL"
                    title="Remove 3PL"
                  />
                )}
              </div>
            );
          })}
          <Form.ErrorList errors={errors} />
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => add({ quantity: 0 })}
            disabled={disabled || fields.length >= threePls.length}
            block
          >
            Add another 3PL
          </Button>
          {threePls.length === 0 && (
            <p className="mb-0 text-xs text-slate-500">No 3PL users are set up for Stock fulfillment yet.</p>
          )}
        </div>
      )}
    </Form.List>
  );
}
