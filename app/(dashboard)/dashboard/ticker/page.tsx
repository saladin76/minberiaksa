"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, Save, Loader2, RefreshCw, Ticket } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useToast } from "@/hooks/use-toast";

interface AmountRange {
  minAmount: number;
  maxAmount: number;
  probability: number;
  label: string;
}

interface TickerConfig {
  id?: string;
  isActive: boolean;
  donorNames: string[];
  amountRanges: AmountRange[];
  minIntervalSeconds: number;
  maxIntervalSeconds: number;
}

export default function TickerAdminPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [config, setConfig] = useState<TickerConfig>({
    isActive: true,
    donorNames: [],
    amountRanges: [],
    minIntervalSeconds: 3,
    maxIntervalSeconds: 8,
  });

  // حالة مؤقتة لإدخال أسماء المتبرعين (مفصولة بفواصل)
  const [donorNamesInput, setDonorNamesInput] = useState("");

  // جلب الإعدادات الحالية عند تحميل الصفحة
  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/live-donation-ticker");
      if (response.ok) {
        const data = await response.json();
        setConfig({
          id: data.id,
          isActive: true,
          donorNames: data.donorNames,
          amountRanges: data.amountRanges,
          minIntervalSeconds: data.minIntervalSeconds,
          maxIntervalSeconds: data.maxIntervalSeconds,
        });

        // تعبئة حقل الإدخال بالقيم المفصولة بفواصل
        setDonorNamesInput(data.donorNames.join(", "));
      }
    } catch (error) {
      console.error("خطأ أثناء جلب الإعدادات:", error);
      toast({
        title: "خطأ",
        description: "فشل في تحميل إعدادات شريط التبرعات",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // تحويل القيم المفصولة بفواصل إلى مصفوفة
      const donorNames = donorNamesInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      // التحقق من صحة البيانات
      if (donorNames.length === 0) {
        toast({
          title: "خطأ في التحقق",
          description: "يرجى إضافة اسم متبرع واحد على الأقل",
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      if (config.amountRanges.length === 0) {
        toast({
          title: "خطأ في التحقق",
          description: "يرجى إضافة نطاق تبرع واحد على الأقل",
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      if (config.minIntervalSeconds <= 0 || config.maxIntervalSeconds <= 0) {
        toast({
          title: "خطأ في التحقق",
          description: "عدد الثواني يجب أن يكون أكبر من صفر",
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      if (config.minIntervalSeconds >= config.maxIntervalSeconds) {
        toast({
          title: "خطأ في التحقق",
          description: "الحد الأدنى يجب أن يكون أقل من الحد الأقصى",
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      const payload = {
        ...config,
        donorNames,
      };

      const response = await fetch("/api/live-donation-ticker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "فشل في حفظ الإعدادات");
      }

      const saved = await response.json();
      setConfig({ ...config, id: saved.id });

      toast({
        title: "تم بنجاح",
        description: "تم حفظ إعدادات شريط التبرعات بنجاح",
      });
    } catch (error: any) {
      console.error("خطأ أثناء الحفظ:", error);
      toast({
        title: "خطأ",
        description: error.message || "فشل في حفظ الإعدادات",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const addAmountRange = () => {
    setConfig({
      ...config,
      amountRanges: [
        ...config.amountRanges,
        { minAmount: 10, maxAmount: 50, probability: 50, label: "نطاق_جديد" },
      ],
    });
  };

  const removeAmountRange = (index: number) => {
    setConfig({
      ...config,
      amountRanges: config.amountRanges.filter((_, i) => i !== index),
    });
  };

  const updateAmountRange = (
    index: number,
    field: keyof AmountRange,
    value: number | string,
  ) => {
    const updated = [...config.amountRanges];
    updated[index] = { ...updated[index], [field]: value };
    setConfig({ ...config, amountRanges: updated });
  };

  const calculateTotalProbability = () => {
    return config.amountRanges.reduce(
      (sum, range) => sum + range.probability,
      0,
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="إعدادات شريط التبرعات المباشر"
        description="إدارة إعدادات عرض التبرعات المباشرة"
        icon={Ticket}
        actions={<>
          <Button variant="outline" onClick={fetchConfig} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            تحديث
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            حفظ الإعدادات
          </Button>
        </>}
      />

      {/* حالة الشريط */}
      <Card>
        <CardHeader>
          <CardTitle>حالة الشريط</CardTitle>
          <CardDescription>تفعيل أو إيقاف شريط التبرعات</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <Label className="text-base">
              {config.isActive ? "الشريط مفعل" : "الشريط متوقف"}
            </Label>
            <Switch
              checked={config.isActive}
              onCheckedChange={(checked) =>
                setConfig({ ...config, isActive: checked })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* أسماء المتبرعين */}
      <Card>
        <CardHeader>
          <CardTitle>أسماء المتبرعين</CardTitle>
          <CardDescription>
            أدخل الأسماء مفصولة بفواصل، وسيتم اختيارها عشوائيًا للعرض
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="أحمد، محمد، فاطمة، سارة، عبد الله..."
            value={donorNamesInput}
            onChange={(e) => setDonorNamesInput(e.target.value)}
            rows={4}
            className="font-mono text-sm"
          />
          <p className="text-sm text-muted-foreground mt-2">
            العدد الحالي: {donorNamesInput.split(",").filter(Boolean).length}{" "}
            اسم
          </p>
        </CardContent>
      </Card>

      {/* نطاقات التبرعات */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>نطاقات المبالغ</CardTitle>
              <CardDescription>
                تحديد نطاقات التبرع مع نسب احتمالية
              </CardDescription>
            </div>
            <Button onClick={addAmountRange} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              إضافة نطاق
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {config.amountRanges.map((range, index) => (
            <div
              key={index}
              className="grid grid-cols-1 gap-4 p-4 border rounded-lg bg-muted/50 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
            >
              <div>
                <Label>الحد الأدنى ($)</Label>
                <Input
                  type="number"
                  value={range.minAmount}
                  onChange={(e) =>
                    updateAmountRange(
                      index,
                      "minAmount",
                      parseFloat(e.target.value) || 0,
                    )
                  }
                />
              </div>
              <div>
                <Label>الحد الأقصى ($)</Label>
                <Input
                  type="number"
                  value={range.maxAmount}
                  onChange={(e) =>
                    updateAmountRange(
                      index,
                      "maxAmount",
                      parseFloat(e.target.value) || 0,
                    )
                  }
                />
              </div>
              <div>
                <Label>الاحتمالية</Label>
                <Input
                  type="number"
                  value={range.probability}
                  onChange={(e) =>
                    updateAmountRange(
                      index,
                      "probability",
                      parseFloat(e.target.value) || 0,
                    )
                  }
                />
              </div>
              <div className="col-span-2">
                <Label>التسمية</Label>
                <Input
                  value={range.label}
                  onChange={(e) =>
                    updateAmountRange(index, "label", e.target.value)
                  }
                  placeholder="صغير، متوسط، كبير"
                />
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => removeAmountRange(index)}
                  className="w-full"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          {config.amountRanges.length > 0 && (
            <div className="flex items-center justify-between p-4 bg-brand/8 rounded-lg">
              <span className="font-medium">إجمالي الاحتمالات:</span>
              <span className="text-lg font-bold">
                {calculateTotalProbability()}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* توقيت العرض */}
      <Card>
        <CardHeader>
          <CardTitle>توقيت العرض</CardTitle>
          <CardDescription>التحكم في عدد الثواني بين كل تبرع</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-6">
          <div>
            <Label>أقل مدة (ثواني)</Label>
            <Input
              type="number"
              value={config.minIntervalSeconds}
              onChange={(e) =>
                setConfig({
                  ...config,
                  minIntervalSeconds: parseInt(e.target.value) || 1,
                })
              }
            />
          </div>
          <div>
            <Label>أقصى مدة (ثواني)</Label>
            <Input
              type="number"
              value={config.maxIntervalSeconds}
              onChange={(e) =>
                setConfig({
                  ...config,
                  maxIntervalSeconds: parseInt(e.target.value) || 1,
                })
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
