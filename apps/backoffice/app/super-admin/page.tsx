"use client";

import { CheckOutlined, CloseOutlined } from "@ant-design/icons";
import { Alert, Button, Popconfirm, Space, Table, Tag } from "antd";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { getStoredUser, getToken, listAllCompanies, listPendingSeatOrders, reviewSeatOrder } from "@/lib/api";

export default function SuperAdminPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    listAllCompanies().then(setCompanies).catch((err) => setError(err.message));
    listPendingSeatOrders().then(setPending).catch((err) => setError(err.message));
  }

  useEffect(() => {
    const user = getStoredUser();
    if (!getToken() || !user?.roles.includes("SUPER_ADMIN" as never)) {
      router.push("/");
      return;
    }
    refresh();
  }, [router]);

  async function handleReview(id: string, approve: boolean) {
    await reviewSeatOrder(id, approve);
    refresh();
  }

  const companyName = new Map(companies.map((c: any) => [c.id, c.name as string]));

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-5xl p-8">
        <h1 className="text-2xl font-semibold">Super Admin</h1>
        {error && <Alert type="error" title={error} className="mt-4" showIcon />}

        <h2 className="mt-8 text-lg font-medium">Pending seat payment orders</h2>
        <Table
          className="mt-4"
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={pending}
          locale={{ emptyText: "Nothing pending review." }}
          columns={[
            { title: "Company", dataIndex: "companyId", render: (id: string) => companyName.get(id) ?? id },
            { title: "Submitted", dataIndex: "createdAt", render: (v: string) => new Date(v).toLocaleString() },
            { title: "Total", dataIndex: "totalAmount", render: (v: number) => `$${Number(v).toFixed(2)}` },
            {
              title: "Receipt",
              dataIndex: "receiptFileUrl",
              render: (url: string | null) =>
                url ? (
                  <a href={`${process.env.NEXT_PUBLIC_API_URL}${url}`} target="_blank" rel="noreferrer">
                    View
                  </a>
                ) : (
                  "—"
                ),
            },
            {
              key: "actions",
              render: (_: unknown, o: any) => (
                <Space size="small">
                  <Popconfirm title="Approve this payment and activate the seat(s)?" onConfirm={() => handleReview(o.id, true)}>
                    <Button size="small" type="primary" icon={<CheckOutlined />}>
                      Approve
                    </Button>
                  </Popconfirm>
                  <Popconfirm title="Reject this payment order?" onConfirm={() => handleReview(o.id, false)}>
                    <Button size="small" danger icon={<CloseOutlined />}>
                      Reject
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />

        <h2 className="mt-8 text-lg font-medium">All companies</h2>
        <Table
          className="mt-4"
          rowKey="id"
          size="small"
          pagination={{ pageSize: 50, hideOnSinglePage: true }}
          dataSource={companies}
          columns={[
            { title: "Name", dataIndex: "name", sorter: (a: any, b: any) => a.name.localeCompare(b.name) },
            {
              title: "Verified",
              dataIndex: "emailVerifiedAt",
              render: (v: string | null) => (v ? <Tag color="green">Yes</Tag> : <Tag>No</Tag>),
            },
            { title: "Created", dataIndex: "createdAt", render: (v: string) => new Date(v).toLocaleDateString() },
          ]}
        />
      </main>
    </>
  );
}
