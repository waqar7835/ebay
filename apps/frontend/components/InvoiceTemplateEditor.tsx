"use client";

import {
  INVOICE_TEMPLATE_COLOR_KEYS,
  InvoiceLayout,
  PREDEFINED_INVOICE_TEMPLATES,
  type InvoiceTemplateColors,
  type InvoiceTemplateDto,
} from "@ebay-order-management/shared";
import { ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Card, ColorPicker, Form, Input, Radio, Segmented, Select, Spin, type ColorPickerProps } from "antd";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BackLink from "@/components/BackLink";
import ImageUpload from "@/components/ImageUpload";
import { COLOR_LABELS, LAYOUT_LABELS } from "@/components/InvoiceTemplateSwatches";
import {
  createInvoiceTemplate,
  getStoredUser,
  getToken,
  listInvoiceTemplates,
  mediaUrl,
  previewInvoiceTemplate,
  removeInvoiceTemplateLogo,
  updateInvoiceTemplate,
  uploadInvoiceTemplateLogo,
} from "@/lib/api";

type SampleRole = "ACCOUNT_HOLDER" | "STOCK_OWNER" | "THREE_PL";
type PickerColor = Parameters<NonNullable<ColorPickerProps["onChange"]>>[0];

const layoutDefaults = (layout: InvoiceLayout) => PREDEFINED_INVOICE_TEMPLATES.find((t) => t.layout === layout)!;

/**
 * Create or edit a custom invoice template: pick a layout (fixed), change its five colors, and use
 * the company logo or the template's own. A sample invoice re-renders on the right as you go.
 * `templateId` = edit that template; otherwise a new one starting from `fromId` (any template).
 */
export default function InvoiceTemplateEditor({ templateId, fromId }: { templateId?: string; fromId?: string }) {
  const router = useRouter();
  const isAdmin = getStoredUser()?.roles.includes("ADMIN" as never) ?? false;

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [layout, setLayout] = useState<InvoiceLayout>(InvoiceLayout.CLASSIC);
  const [colors, setColors] = useState<InvoiceTemplateColors>(PREDEFINED_INVOICE_TEMPLATES[0].colors);
  // Each picker's color while it's being dragged. Controlling the pickers with the saved hex alone would
  // reset them mid-drag (and lose the hue of greys), so the drag never landed.
  const [liveColors, setLiveColors] = useState<Partial<Record<keyof InvoiceTemplateColors, PickerColor>>>({});
  const [logoMode, setLogoMode] = useState<"company" | "own">("company");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [savedLogoUrl, setSavedLogoUrl] = useState<string | null>(null);

  const [sampleRole, setSampleRole] = useState<SampleRole>("ACCOUNT_HOLDER");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewRun = useRef(0);

  const [saving, setSaving] = useState(false);
  /** Set once a new template is created, so a retry after a failed logo upload updates it instead of duplicating it. */
  const [savedId, setSavedId] = useState(templateId);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    if (!isAdmin) return;
    listInvoiceTemplates()
      .then(({ templates }) => {
        const source: InvoiceTemplateDto | undefined = templates.find((t) => t.id === (templateId ?? fromId));
        if (templateId && !source) throw new Error("Template not found");
        const start = source ?? templates[0];
        setName(templateId ? start.name : `${start.name} (custom)`);
        setLayout(start.layout);
        setColors(start.colors);
        setLiveColors({});
        if (templateId && start.logoUrl) {
          setLogoMode("own");
          setSavedLogoUrl(start.logoUrl);
        }
        setLoaded(true);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load templates"));
  }, [router, templateId, fromId, isAdmin]);

  // Re-render the sample shortly after the last change; stale responses are dropped.
  useEffect(() => {
    if (!loaded) return;
    const run = ++previewRun.current;
    const timer = setTimeout(async () => {
      setPreviewing(true);
      setPreviewError(null);
      try {
        const blob = await previewInvoiceTemplate({
          layout,
          colors,
          role: sampleRole,
          useCompanyLogo: logoMode === "company",
          logo: logoMode === "own" ? logoFile : null,
          templateId,
        });
        if (run !== previewRun.current) return;
        setPdfUrl(URL.createObjectURL(blob));
      } catch (err) {
        if (run === previewRun.current) setPreviewError(err instanceof Error ? err.message : "Preview failed");
      } finally {
        if (run === previewRun.current) setPreviewing(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [loaded, layout, colors, sampleRole, logoMode, logoFile, templateId]);

  // Free each previewed PDF when it's replaced or the page closes.
  useEffect(() => () => void (pdfUrl && URL.revokeObjectURL(pdfUrl)), [pdfUrl]);

  async function handleSave() {
    if (saving) return;
    setSaveError(null);
    if (!name.trim()) {
      setSaveError("Give the template a name");
      return;
    }
    if (logoMode === "own" && !logoFile && !savedLogoUrl) {
      setSaveError("Upload a logo, or use the company logo");
      return;
    }
    setSaving(true);
    try {
      const input = { name: name.trim(), layout, colors };
      const saved = savedId ? await updateInvoiceTemplate(savedId, input) : await createInvoiceTemplate(input);
      setSavedId(saved.id);
      if (logoMode === "own" && logoFile) await uploadInvoiceTemplateLogo(saved.id, logoFile);
      if (logoMode === "company" && saved.logoUrl) await removeInvoiceTemplateLogo(saved.id);
      router.push("/profile");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  }

  const title = templateId ? "Edit invoice template" : "New invoice template";
  if (!isAdmin) {
    return (
      <>
        <BackLink href="/profile" label="Profile" title={title} />
        <Alert type="warning" title="Only the company Admin can manage invoice templates" className="mt-6" showIcon />
      </>
    );
  }

  return (
    <>
      <BackLink href="/profile" label="Profile" title={title} />
      {loadError && <Alert type="error" title={loadError} className="mt-4" showIcon />}

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Form layout="vertical" component={false} disabled={!loaded}>
            <Card title="Template">
              <Form.Item label="Name" required>
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Blue for Account Holders" />
              </Form.Item>
              <Form.Item label="Layout" tooltip="The arrangement of the page. Layouts are fixed; colors and logo are yours" className="mb-0">
                <Select
                  value={layout}
                  onChange={setLayout}
                  options={Object.values(InvoiceLayout).map((l) => ({
                    value: l,
                    label: LAYOUT_LABELS[l].name,
                    description: LAYOUT_LABELS[l].description,
                  }))}
                  optionRender={(option) => (
                    <div>
                      <div>{option.data.label}</div>
                      <div className="text-xs text-slate-500">{option.data.description}</div>
                    </div>
                  )}
                />
              </Form.Item>
            </Card>

            <Card
              title="Colors"
              extra={
                <Button size="small" icon={<ReloadOutlined />} onClick={() => {
                    setColors(layoutDefaults(layout).colors);
                    setLiveColors({});
                  }}>
                  {LAYOUT_LABELS[layout].name} defaults
                </Button>
              }
            >
              <div className="flex flex-col gap-4">
                {INVOICE_TEMPLATE_COLOR_KEYS.map((key) => (
                  <div key={key} className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-medium">{COLOR_LABELS[key].name}</div>
                      <div className="text-xs text-slate-500">{COLOR_LABELS[key].help}</div>
                    </div>
                    <ColorPicker
                      value={liveColors[key] ?? colors[key]}
                      disabledAlpha
                      showText
                      onChange={(c) => setLiveColors((prev) => ({ ...prev, [key]: c }))}
                      onChangeComplete={(c) => {
                        const hex = c.toHexString();
                        // Only re-render the preview when the color really changed (a hue move on white/grey doesn't).
                        setColors((prev) => (prev[key] === hex ? prev : { ...prev, [key]: hex }));
                      }}
                    />
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Logo">
              <Radio.Group
                value={logoMode}
                onChange={(e) => setLogoMode(e.target.value)}
                options={[
                  { value: "company", label: "Company logo" },
                  { value: "own", label: "This template's own logo" },
                ]}
              />
              {logoMode === "own" && (
                <div className="mt-4">
                  <ImageUpload
                    value={logoFile}
                    existingUrl={savedLogoUrl ? mediaUrl(savedLogoUrl) : null}
                    onChange={setLogoFile}
                    freeAspect
                    keepTransparency
                  />
                  <div className="text-xs text-slate-500">PNG or JPEG. A PNG keeps its transparent background.</div>
                </div>
              )}
            </Card>
          </Form>

          <Card>
            {saveError && <Alert type="error" title={saveError} className="mb-4" showIcon />}
            <Button type="primary" size="large" block onClick={handleSave} loading={saving} disabled={!loaded}>
              {templateId ? "Save changes" : "Save template"}
            </Button>
            <p className="mb-0 mt-3 text-xs text-slate-500">
              Invoices already issued keep the look they were approved with.
            </p>
          </Card>
        </div>

        <Card
          className="xl:col-span-3"
          title={
            <span>
              Preview <span className="text-sm font-normal text-slate-500">— sample invoice</span>
            </span>
          }
          extra={
            <Segmented<SampleRole>
              size="small"
              value={sampleRole}
              onChange={setSampleRole}
              options={[
                { value: "ACCOUNT_HOLDER", label: "Account Holder" },
                { value: "STOCK_OWNER", label: "Stock Owner" },
                { value: "THREE_PL", label: "3PL" },
              ]}
            />
          }
        >
          {previewError && <Alert type="error" title={previewError} className="mb-4" showIcon />}
          <Spin spinning={previewing || !pdfUrl}>
            {pdfUrl ? (
              <iframe src={pdfUrl} title="Invoice template preview" className="h-[80vh] w-full rounded border" />
            ) : (
              <div className="h-[80vh] w-full rounded border bg-slate-50" />
            )}
          </Spin>
        </Card>
      </div>
    </>
  );
}
