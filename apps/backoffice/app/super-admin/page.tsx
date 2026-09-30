"use client";

import { Alert, Table, Tag } from "antd";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { getStoredUser, getToken, listAllCompanies } from "@/lib/api";

export default function SuperAdminPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    listAllCompanies().then(setCompanies).catch((err) => setError(err.message));
  }

  useEffect(() => {
    const user = getStoredUser();
    if (!getToken() || !user?.roles.includes("SUPER_ADMIN" as never)) {
      router.push("/");
      return;
    }
    refresh();
  }, [router]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Nav />
      <main className="ml-56 p-8">
        <h1 className="text-2xl font-semibold">Super Admin</h1>
        {error && <Alert type="error" title={error} className="mt-4" showIcon />}
        <p className="mt-2 text-sm text-gray-500">
          Subscription payments, plans and durations are managed on the <Link href="/subscriptions">Subscriptions</Link> page.
        </p>

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
            {
              title: "Plan",
              key: "plan",
              render: (_: unknown, c: any) =>
                c.subscriptionPlan && c.subscriptionEndsAt >= today ? (
                  <Tag color="blue">
                    {c.subscriptionPlan.name} · until {c.subscriptionEndsAt}
                  </Tag>
                ) : (
                  <Tag>Free</Tag>
                ),
            },
            { title: "Created", dataIndex: "createdAt", render: (v: string) => new Date(v).toLocaleDateString() },
          ]}
        />
      </main>
    </>
  );
}
