"use client";

import type { Currency } from "@ebay-order-management/shared";
import { Alert, App, Button, Form, Modal, Select, Table, Tag } from "antd";
import { useEffect, useState } from "react";
import { getOrdersOffCurrency, recomputeOrdersCurrency, updateUser, type OrdersOffCurrency } from "@/lib/api";
import { currencyOptions, currencySymbol } from "@/lib/currency";

export interface CurrencyUser {
  id: string;
  email: string;
  name: string | null;
  currency: Currency | null;
}

/**
 * Changes an Account Holder / Stock Owner / 3PL's currency, then offers to move their open orders to it
 * (the amounts stay as typed and are re-read in the new currency; invoiced orders are skipped).
 */
export default function UserCurrencyModal({
  user,
  onClose,
  onSaved,
}: {
  user: CurrencyUser | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const [savedCurrency, setSavedCurrency] = useState<Currency | null>(null);
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [offCurrency, setOffCurrency] = useState<OrdersOffCurrency | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setSavedCurrency(user.currency);
    setCurrency(user.currency);
    setOffCurrency(null);
    setError(null);
    getOrdersOffCurrency(user.id)
      .then(setOffCurrency)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load the user's orders"));
  }, [user]);

  if (!user) return null;
  const changed = currency !== savedCurrency;
  const pending = !changed && offCurrency ? offCurrency.orders : [];

  async function saveCurrency() {
    if (!user || !currency) return;
    setSaving(true);
    setError(null);
    try {
      await updateUser(user.id, { currency });
      setSavedCurrency(currency);
      onSaved();
      const off = await getOrdersOffCurrency(user.id);
      setOffCurrency(off);
      message.success(`Currency changed to ${currency}`);
      if (!off.orders.length) onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change the currency");
    } finally {
      setSaving(false);
    }
  }

  async function updateOrders() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const res = await recomputeOrdersCurrency(user.id);
      message.success(`${res.updated} order${res.updated === 1 ? "" : "s"} updated to ${res.currency}`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update the orders");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={`Currency — ${user.name ?? user.email}`}
      width={560}
      onCancel={() => !saving && onClose()}
      maskClosable={!saving}
      footer={[
        <Button key="cancel" onClick={onClose} disabled={saving}>
          {pending.length ? "Not now" : "Cancel"}
        </Button>,
        pending.length ? (
          <Button key="update" type="primary" loading={saving} onClick={updateOrders}>
            Update {pending.length} order{pending.length === 1 ? "" : "s"}
          </Button>
        ) : (
          <Button key="save" type="primary" loading={saving} disabled={!changed} onClick={saveCurrency}>
            Save currency
          </Button>
        ),
      ]}
    >
      <Form layout="vertical">
        <Form.Item label="Currency" tooltip="Their amounts are entered in this currency and converted to PKR on each order">
          <Select
            value={currency ?? undefined}
            onChange={setCurrency}
            options={currencyOptions}
            showSearch={{ optionFilterProp: "label" }}
            disabled={saving}
          />
        </Form.Item>
      </Form>
      {error && <Alert type="error" title={error} className="mb-4" showIcon />}
      {changed && (
        <Alert
          type="info"
          showIcon
          className="mb-4"
          title={`Re-enter this user's fees and product prices in ${currency}. After saving you can also update their open orders.`}
        />
      )}
      {pending.length > 0 && offCurrency && (
        <>
          <Alert
            type="warning"
            showIcon
            title={`${pending.length} open order${pending.length === 1 ? " is" : "s are"} still in this user's old currency`}
            description={`The amounts stay as they were typed: each is read as ${offCurrency.currency} (e.g. 5.60 becomes ${currencySymbol(
              offCurrency.currency,
            )}5.60) and converted to PKR again. Orders on an invoice aren't changed.`}
            className="mb-4"
          />
          <Table
            rowKey="id"
            size="small"
            dataSource={pending}
            pagination={false}
            scroll={{ y: 320 }}
            columns={[
              { title: "Order #", dataIndex: "ebayOrderRef" },
              { title: "Current currency", key: "from", render: (_, o) => <Tag>{o.from ?? "—"}</Tag> },
              { title: "New currency", key: "to", render: () => <Tag color="blue">{offCurrency.currency}</Tag> },
            ]}
          />
        </>
      )}
    </Modal>
  );
}
