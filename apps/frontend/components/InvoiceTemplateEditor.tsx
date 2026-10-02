"use client";

import {
  DEFAULT_INVOICE_WATERMARK,
  INVOICE_TEMPLATE_COLOR_KEYS,
  INVOICE_WATERMARK_LIMITS as LIMITS,
  InvoiceLayout,
  PREDEFINED_INVOICE_TEMPLATES,
  type InvoiceTemplateColors,
  type InvoiceTemplateDto,
  type InvoiceWatermark,
} from "@ebay-order-management/shared";
import { ReloadOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Collapse,
  ColorPicker,
  Form,
  Input,
  Radio,
  Segmented,
  Select,
  Slider,
  Spin,
  type ColorPickerProps,
} from "antd";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BackLink from "@/components/BackLink";
import ImageUpload from "@/components/ImageUpload";
import { COLOR_LABELS, LAYOUT_LABELS } from "@/components/InvoiceTemplateSwatches";
import {
  createInvoiceTemplate,
  getMyCompany,
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
 * Create or edit an invoice template: pick a layout (fixed), change its five colors, use the company
 * logo or the template's own, and optionally add a watermark. A sample invoice re-renders on the
 * right as you go. `templateId` = edit that template (a predefined one keeps its name and layout);
 * otherwise a new custom one starting from `fromId`, which can be switched to any template.
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
  const [watermark, setWatermark] = useState<InvoiceWatermark>(DEFAULT_INVOICE_WATERMARK);
  const [liveWatermarkColor, setLiveWatermarkColor] = useState<PickerColor | null>(null);
  const [templates, setTemplates] = useState<InvoiceTemplateDto[]>([]);
  const [sourceId, setSourceId] = useState<string | undefined>(fromId);
  const [predefined, setPredefined] = useState(false);
  const [companyName, setCompanyName] = useState("");
  /** The one settings group that's open (accordion); undefined = all collapsed. */
  const [openGroup, setOpenGroup] = useState<string | undefined>("template");

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
      router.push("/login");
      return;
    }
    if (!isAdmin) return;
    Promise.all([listInvoiceTemplates(), getMyCompany()])
      .then(([{ templates }, company]) => {
        const source: InvoiceTemplateDto | undefined = templates.find((t) => t.id === (templateId ?? fromId));
        if (templateId && !source) throw new Error("Template not found");
        const start = source ?? templates[0];
        setTemplates(templates);
        setCompanyName(company.name);
        setSourceId(start.id);
        setPredefined(!!templateId && start.predefined);
        applySource(start, company.name);
        if (templateId && start.logoUrl) {
          setLogoMode("own");
          setSavedLogoUrl(start.logoUrl);
        }
        setLoaded(true);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load templates"));
  }, [router, templateId, fromId, isAdmin]);

  /** Fill the form from a template: the one being edited, or the one a new template starts from. */
  function applySource(source: InvoiceTemplateDto, company: string) {
    setName(templateId ? source.name : `${source.name} (custom)`);
    setLayout(source.layout);
    setColors(source.colors);
    setLiveColors({});
    const saved = source.watermark ?? DEFAULT_INVOICE_WATERMARK;
    setWatermark({ ...saved, text: saved.text || company });
    setLiveWatermarkColor(null);
  }

  function changeSource(id: string) {
    const source = templates.find((t) => t.id === id);
    if (!source) return;
    setSourceId(id);
    applySource(source, companyName);
  }

  const updateWatermark = (patch: Partial<InvoiceWatermark>) => setWatermark((prev) => ({ ...prev, ...patch }));

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
          watermark,
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
  }, [loaded, layout, colors, watermark, sampleRole, logoMode, logoFile, templateId]);

  // Free each previewed PDF when it's replaced or the page closes.
  useEffect(() => () => void (pdfUrl && URL.revokeObjectURL(pdfUrl)), [pdfUrl]);

  async function handleSave() {
    if (saving) return;
    setSaveError(null);
    if (!name.trim()) {
      setSaveError("Give the template a name");
      return;
    }
    if (watermark.enabled && !watermark.text.trim()) {
      setSaveError("Enter the watermark text, or turn the watermark off");
      return;
    }
    if (logoMode === "own" && !logoFile && !savedLogoUrl) {
      setSaveError("Upload a logo, or use the company logo");
      return;
    }
    setSaving(true);
    try {
      const input = { name: name.trim(), layout, colors, watermark: { ...watermark, text: watermark.text.trim() } };
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

      <div className="mt-6 grid gap-6 xl:h-[calc(100vh-7.5rem)] xl:grid-cols-5 xl:grid-rows-1">
        <Card
          className="flex flex-col xl:col-span-3 xl:min-h-0"
          styles={{ body: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } }}
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
          <div className="relative h-[80vh] xl:h-auto xl:flex-1">
            {pdfUrl ? (
              <iframe src={pdfUrl} title="Invoice template preview" className="absolute inset-0 h-full w-full rounded border" />
            ) : (
              <div className="absolute inset-0 rounded border bg-slate-50" />
            )}
            {(previewing || !pdfUrl) && (
              <div className="absolute inset-0 flex items-center justify-center rounded bg-white/40">
                <Spin />
              </div>
            )}
          </div>
        </Card>

        {/* Only the settings scroll; the preview stays in view and Save stays pinned below. */}
        <div className="flex flex-col gap-4 xl:col-span-2 xl:min-h-0">
          <div className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
            <Form layout="vertical" component={false} disabled={!loaded}>
              <Collapse
                accordion
                activeKey={openGroup ? [openGroup] : []}
                onChange={(keys) => setOpenGroup(([] as string[]).concat(keys)[0])}
                expandIconPlacement="end"
                className="bg-white"
                classNames={{ header: "bg-white", title: "font-semibold" }}
                items={[
                  {
                    key: "template",
                    label: "Template",
                    children: (
                      <>
                        {!templateId && (
                          <Form.Item label="Start from" tooltip="Copies that template's colors and watermark; change anything below">
                            <Select
                              value={sourceId}
                              onChange={changeSource}
                              showSearch={{ optionFilterProp: "label" }}
                              options={templates.map((t) => ({
                                value: t.id,
                                label: t.name,
                                description: `${LAYOUT_LABELS[t.layout].name} layout · ${t.predefined ? "Predefined" : "Custom"}`,
                              }))}
                              optionRender={(option) => (
                                <div>
                                  <div>{option.data.label}</div>
                                  <div className="text-xs text-slate-500">{option.data.description}</div>
                                </div>
                              )}
                            />
                          </Form.Item>
                        )}
                        <Form.Item
                          label="Name"
                          required={!predefined}
                          extra={predefined ? "Predefined templates keep their name and layout" : undefined}
                        >
                          <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={60}
                            placeholder="e.g. Blue for Account Holders"
                            disabled={predefined}
                          />
                        </Form.Item>
                        <Form.Item label="Layout" tooltip="The arrangement of the page. Layouts are fixed; colors and logo are yours" className="mb-0">
                          <Select
                            value={layout}
                            disabled={predefined}
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
                      </>
                    ),
                  },
                  {
                    key: "colors",
                    label: "Colors",
                    extra: (
                      <Button
                        size="small"
                        icon={<ReloadOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          setColors(layoutDefaults(layout).colors);
                          setLiveColors({});
                        }}
                      >
                        {LAYOUT_LABELS[layout].name} defaults
                      </Button>
                    ),
                    children: (
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
                    ),
                  },
                  {
                    key: "logo",
                    label: "Logo",
                    children: (
                      <>
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
                      </>
                    ),
                  },
                  {
                    key: "watermark",
                    label: (
                      // Ticking the box shouldn't also toggle the panel; turning it on opens the settings.
                      <span onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={watermark.enabled}
                          onChange={(e) => {
                            updateWatermark({ enabled: e.target.checked });
                            if (e.target.checked) setOpenGroup("watermark");
                          }}
                        >
                          <span className="font-semibold">Watermark</span>
                        </Checkbox>
                      </span>
                    ),
                    children: (
                      <>
                        {!watermark.enabled ? (
                          <p className="m-0 text-sm text-slate-500">
                            Off: the invoice preview shows DRAFT and issued invoices have no watermark. Turn it on to print your
                            own text over every page of every invoice made with this template.
                          </p>
                        ) : (
                          <>
                            <Form.Item label="Text" required>
                              <Input
                                value={watermark.text}
                                onChange={(e) => updateWatermark({ text: e.target.value })}
                                maxLength={LIMITS.text}
                                placeholder={companyName || "e.g. your company name"}
                              />
                            </Form.Item>
                            <div className="mb-6 flex items-center justify-between gap-4">
                              <div>
                                <div className="font-medium">Color</div>
                                <div className="text-xs text-slate-500">The watermark text color</div>
                              </div>
                              <ColorPicker
                                value={liveWatermarkColor ?? watermark.color}
                                disabledAlpha
                                showText
                                onChange={setLiveWatermarkColor}
                                onChangeComplete={(c) => {
                                  const hex = c.toHexString();
                                  setWatermark((prev) => (prev.color === hex ? prev : { ...prev, color: hex }));
                                }}
                              />
                            </div>
                            <SliderField
                              label="Size"
                              value={watermark.size}
                              min={LIMITS.size.min}
                              max={LIMITS.size.max}
                              unit="pt"
                              onChange={(size) => updateWatermark({ size })}
                            />
                            <SliderField
                              label="Transparency"
                              help="Lower is more transparent"
                              value={watermark.opacity}
                              min={LIMITS.opacity.min}
                              max={LIMITS.opacity.max}
                              unit="% opacity"
                              onChange={(opacity) => updateWatermark({ opacity })}
                            />
                            <SliderField
                              label="Rotation"
                              help="Center is flat; right turns it clockwise, left counter-clockwise"
                              value={watermark.rotation}
                              min={LIMITS.rotation.min}
                              max={LIMITS.rotation.max}
                              unit="°"
                              marks={{ [LIMITS.rotation.min]: `${LIMITS.rotation.min}°`, 0: "0°", [LIMITS.rotation.max]: `${LIMITS.rotation.max}°` }}
                              onChange={(rotation) => updateWatermark({ rotation })}
                            />
                            <Checkbox
                              checked={watermark.repeat}
                              onChange={(e) => updateWatermark({ repeat: e.target.checked })}
                              className={watermark.repeat ? "mb-4" : undefined}
                            >
                              Repeat across the page
                            </Checkbox>
                            {watermark.repeat && (
                              <>
                                <SliderField
                                  label="Horizontal spacing"
                                  help="Space between copies side by side"
                                  value={watermark.gapX}
                                  min={LIMITS.gap.min}
                                  max={LIMITS.gap.max}
                                  unit="pt"
                                  onChange={(gapX) => updateWatermark({ gapX })}
                                />
                                <SliderField
                                  label="Vertical spacing"
                                  help="Space between rows of copies"
                                  value={watermark.gapY}
                                  min={LIMITS.gap.min}
                                  max={LIMITS.gap.max}
                                  unit="pt"
                                  onChange={(gapY) => updateWatermark({ gapY })}
                                  last
                                />
                              </>
                            )}
                          </>
                        )}
                      </>
                    ),
                  },
                ]}
              />
            </Form>
          </div>

          <Card className="shrink-0">
            {saveError && <Alert type="error" title={saveError} className="mb-4" showIcon />}
            <Button type="primary" size="large" block onClick={handleSave} loading={saving} disabled={!loaded}>
              {templateId ? "Save changes" : "Save template"}
            </Button>
            <p className="mb-0 mt-3 text-xs text-slate-500">
              Invoices already issued keep the look they were approved with.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

/** A labeled slider with its current value shown beside the label. */
function SliderField({
  label,
  help,
  value,
  min,
  max,
  unit,
  marks,
  onChange,
  last,
}: {
  label: string;
  help?: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  marks?: Record<number, string>;
  onChange: (value: number) => void;
  last?: boolean;
}) {
  const format = (v?: number) => `${v ?? ""}${unit.startsWith("°") || unit.startsWith("%") ? "" : " "}${unit}`;
  return (
    <div className={last ? "" : "mb-4"}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-medium">{label}</span>
        <span className="text-sm tabular-nums text-slate-500">{format(value)}</span>
      </div>
      {help && <div className="text-xs text-slate-500">{help}</div>}
      <Slider value={value} min={min} max={max} marks={marks} onChange={onChange} tooltip={{ formatter: format }} />
    </div>
  );
}
