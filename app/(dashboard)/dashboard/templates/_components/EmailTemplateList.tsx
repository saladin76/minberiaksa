"use client";

import * as React from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { EmailTemplateEditorDialog } from "./EmailTemplateEditorDialog";

interface EmailTemplateRow {
  id: string;
  name: string;
  subject: string;
  createdAt: string;
  updatedAt: string;
}

export function EmailTemplateList() {
  const [templates, setTemplates] = React.useState<EmailTemplateRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editor, setEditor] = React.useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });

  const fetchAll = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/templates/email");
      setTemplates(res.data?.templates ?? []);
    } catch {
      toast.error("فشل في تحميل القوالب");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleDelete = async (id: string) => {
    if (!window.confirm("هل تريد حذف هذا القالب؟")) return;
    try {
      await axios.delete(`/api/templates/email/${id}`);
      toast.success("تم الحذف");
      fetchAll();
    } catch {
      toast.error("فشل الحذف");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs text-muted-foreground">
          {loading ? "…" : `${templates.length} قالب بريد`}
        </p>
        <Button
          size="sm"
          onClick={() => setEditor({ open: true, id: null })}
          className="gap-2 bg-brand hover:bg-brand/90"
        >
          <Plus className="w-4 h-4" /> قالب جديد
        </Button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm text-right">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              <th className="text-right py-3 px-4 font-semibold text-slate-700">الاسم</th>
              <th className="text-right py-3 px-4 font-semibold text-slate-700">الموضوع</th>
              <th className="text-right py-3 px-4 font-semibold text-slate-700">آخر تحديث</th>
              <th className="text-left py-3 px-4 font-semibold text-slate-700">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="py-12 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                </td>
              </tr>
            ) : templates.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-slate-500">
                  لا توجد قوالب بعد — اضغط «قالب جديد» للبدء
                </td>
              </tr>
            ) : (
              templates.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                  <td className="py-3 px-4 font-medium text-slate-900">{t.name}</td>
                  <td className="py-3 px-4 text-slate-600 truncate max-w-[280px]" title={t.subject}>
                    {t.subject}
                  </td>
                  <td className="py-3 px-4 text-slate-500">
                    {new Date(t.updatedAt).toLocaleDateString("ar-EG", { dateStyle: "medium" })}
                  </td>
                  <td className="py-3 px-4 text-left">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditor({ open: true, id: t.id })}
                      >
                        <Pencil className="w-3.5 h-3.5 me-1" /> تعديل
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(t.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-3.5 h-3.5 me-1" /> حذف
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editor.open && (
        <EmailTemplateEditorDialog
          id={editor.id}
          open={editor.open}
          onOpenChange={(open) => {
            setEditor((prev) => ({ ...prev, open }));
            if (!open) fetchAll();
          }}
        />
      )}
    </div>
  );
}
