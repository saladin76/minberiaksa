'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import axios from 'axios';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { FilterBar } from '@/components/dashboard/FilterBar';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { PageHeaderSkeleton, FilterBarSkeleton, TableSkeleton } from '@/components/dashboard/skeletons';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Search,
  Edit,
  Eye,
  ArrowUpDown,
  MoreVertical,
  Download,
  Loader2,
  Archive,
  RotateCcw,
  PowerOff,
  Trash2,
  Heart,
} from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { CampaignReorderDialog } from './_components/CampaignReorderDialog';
import { ContentLocalizationAuditCard } from '../_components/ContentLocalizationAuditCard';
import { computeCampaignProgressPercent, showCampaignProgress } from '@/lib/campaign/campaign-modes';

interface Campaign {
  goalType: string;
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  isActive: boolean;
  createdAt: string;
  // Many-to-many: a campaign can belong to multiple categories. `category`
  // is kept as a single-value alias (first one) for compact table rendering.
  category?: { id: string; name: string } | null;
  categories?: { id: string; name: string }[];
}

interface Category {
  id: string;
  name: string;
}

type ConfirmDialog = {
  open: boolean;
  title: string;
  description: string;
  actionLabel: string;
  actionClassName: string;
  onConfirm: () => void;
};

const CLOSED_DIALOG: ConfirmDialog = {
  open: false,
  title: '',
  description: '',
  actionLabel: '',
  actionClassName: '',
  onConfirm: () => {},
};

export default function CampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<keyof Campaign>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const locale = useLocale() as string;
  const [progressFilter, setProgressFilter] = useState<'all' | 'completed' | 'ongoing'>('all');
  const [page, setPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // id of campaign being acted on
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>(CLOSED_DIALOG);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState('');

  const fetchData = async () => {
    try {
      const lc = locale || 'ar';
      const [campaignsRes, categoriesRes] = await Promise.all([
        axios.get('/api/campaigns/all', { params: { locale: lc, isActiveFalse: true } }),
        axios.get('/api/categories', { params: { locale: lc, counts: true, limit: 200 } }),
      ]);
      setCampaigns(campaignsRes.data?.items || campaignsRes.data || []);
      setCategories(categoriesRes.data?.items || categoriesRes.data || []);
    } catch {
      toast.error('Failed to fetch campaigns');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [locale]);

  const handleSort = (field: keyof Campaign) => {
    if (field === sortField) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDirection('asc'); }
  };

  const setActive = async (id: string, nextActive: boolean) => {
    if (actionLoading) return;
    setActionLoading(id);
    try {
      await axios.put(`/api/campaigns/${id}`, { isActive: nextActive });
      setCampaigns(prev => prev.map(c => c.id === id ? { ...c, isActive: nextActive } : c));
      toast.success(nextActive ? 'تم تفعيل المشروع' : 'تم تعطيل المشروع');
    } catch (err: any) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error || err.message : 'تعذّر تحديث حالة المشروع';
      toast.error(typeof msg === 'string' ? msg : 'تعذّر تحديث حالة المشروع');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeactivate = (campaign: Campaign) => {
    setConfirmDialog({
      open: true,
      title: 'تعطيل المشروع',
      description: `سيتم إخفاء مشروع "${campaign.title}" من الموقع ونقله إلى الأرشيف. يمكنك إعادة تفعيله في أي وقت.`,
      actionLabel: 'تعطيل',
      actionClassName: 'bg-amber-600 hover:bg-amber-700 text-white',
      onConfirm: () => setActive(campaign.id, false),
    });
  };

  const handleReactivate = (campaign: Campaign) => {
    setConfirmDialog({
      open: true,
      title: 'إعادة تفعيل المشروع',
      description: `سيتم نشر مشروع "${campaign.title}" على الموقع مجدداً.`,
      actionLabel: 'تفعيل',
      actionClassName: 'bg-emerald-600 hover:bg-emerald-700 text-white',
      onConfirm: () => setActive(campaign.id, true),
    });
  };

  // Soft delete: the server flips isDeleted + isActive but keeps every
  // DonationItem / SubscriptionItem row pointing at the campaign so the
  // donor history, receipts, and campaign totals stay intact.
  const softDelete = async (id: string) => {
    if (actionLoading) return;
    setActionLoading(id);
    try {
      await axios.delete(`/api/campaigns/${id}`);
      setCampaigns(prev => prev.filter(c => c.id !== id));
      toast.success('تم حذف المشروع (مع الحفاظ على بيانات التبرعات)');
    } catch (err: any) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error || err.message : 'تعذّر حذف المشروع';
      toast.error(typeof msg === 'string' ? msg : 'تعذّر حذف المشروع');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = (campaign: Campaign) => {
    setConfirmDialog({
      open: true,
      title: 'حذف المشروع',
      description: `سيتم حذف مشروع "${campaign.title}" من الموقع ولن يظهر في أي قائمة. ستبقى تبرعاته السابقة وسجلاتها كما هي للمراجعة، لكن لن يمكن استعادة المشروع من الواجهة لاحقاً.`,
      actionLabel: 'حذف نهائي',
      actionClassName: 'bg-red-600 hover:bg-red-700 text-white',
      onConfirm: () => softDelete(campaign.id),
    });
  };

  // Main table: active only
  const activeCampaigns = campaigns.filter(c => c.isActive);
  const archivedCampaigns = campaigns.filter(c => !c.isActive);

  const filteredCampaigns = activeCampaigns
    .filter(c => {
      const cats = c.categories ?? (c.category ? [c.category] : []);
      const catNamesJoined = cats.map((cat) => cat.name).join(' ').toLowerCase();
      const matchesSearch = c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        catNamesJoined.includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || cats.some((cat) => cat.id === selectedCategory);
      // Same helper as the table cell, so the "completed / ongoing" filter and the displayed
      // percentage can never disagree (OPEN-goal campaigns are 0% in both).
      const progress = computeCampaignProgressPercent(c.currentAmount, c.targetAmount, c.goalType);
      const matchesProgress = progressFilter === 'all' ||
        (progressFilter === 'completed' && progress >= 100) ||
        (progressFilter === 'ongoing' && progress < 100);
      return matchesSearch && matchesCategory && matchesProgress;
    })
    .sort((a, b) => {
      // Cast through `any` because `sortField` can in principle be any campaign
      // key, including the now-optional `category`/`categories` relations whose
      // values aren't directly comparable. In practice the table only sorts by
      // scalar columns, so the runtime compare is fine.
      const av = (a as any)[sortField];
      const bv = (b as any)[sortField];
      return sortDirection === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });

  const paginatedCampaigns = filteredCampaigns.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const filteredArchive = archivedCampaigns.filter(c => {
    if (!archiveSearch) return true;
    const cats = c.categories ?? (c.category ? [c.category] : []);
    const catNames = cats.map((cat) => cat.name).join(' ').toLowerCase();
    return c.title.toLowerCase().includes(archiveSearch.toLowerCase()) ||
      catNames.includes(archiveSearch.toLowerCase());
  });

  const exportToCSV = () => {
    const headers = ['Title', 'Categories', 'Target Amount', 'Current Amount', 'Status', 'Created At'];
    const rows = filteredCampaigns.map(c => {
      const cats = c.categories ?? (c.category ? [c.category] : []);
      const names = cats.map((cat) => cat.name).join(' | ');
      return [
        c.title, names, c.targetAmount, c.currentAmount,
        c.isActive ? 'Active' : 'Inactive',
        format(new Date(c.createdAt), 'PPP', { locale: ar }),
      ];
    });
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `campaigns_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  if (loading) return <LoadingSkeleton />;

  return (
    <div>
      <PageHeader
        title="المشاريع"
        description="إدارة مشاريع التبرع"
        icon={Heart}
        actions={
          <>
            <Button onClick={() => window.location.href = '/dashboard/campaigns/new'} className="bg-brand hover:bg-brand-dark gap-2">
              <Plus className="w-4 h-4" />
              إنشاء مشروع جديد
            </Button>
            <Button variant="outline" className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => setArchiveOpen(true)}>
              <Archive className="w-4 h-4" />
              أرشيف المشاريع
              {archivedCampaigns.length > 0 && (
                <span className="bg-amber-100 text-amber-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {archivedCampaigns.length}
                </span>
              )}
            </Button>
            <CampaignReorderDialog onReorder={() => fetchData()} />
          </>
        }
      />

      <div className="mb-4">
        <ContentLocalizationAuditCard section="campaigns" />
      </div>

      <FilterBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="البحث في المشاريع..."
        actions={
          <Button variant="outline" size="sm" className="gap-2" onClick={exportToCSV}>
            <Download className="w-4 h-4" />
            تصدير CSV
          </Button>
        }
      >
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="h-9 w-full sm:w-[180px]"><SelectValue placeholder="جميع الحملات" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الحملات</SelectItem>
            {categories.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={progressFilter} onValueChange={(v: any) => setProgressFilter(v)}>
          <SelectTrigger className="h-9 w-full sm:w-[180px]"><SelectValue placeholder="التقدم" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع المشاريع</SelectItem>
            <SelectItem value="completed">مكتملة</SelectItem>
            <SelectItem value="ongoing">جارية</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">
                  <Button variant="ghost" onClick={() => handleSort('title')} className="hover:bg-transparent p-0 font-bold">
                    عنوان المشروع <ArrowUpDown className="mr-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead className="text-right">الحملة</TableHead>
                <TableHead className="text-right">
                  <Button variant="ghost" onClick={() => handleSort('targetAmount')} className="hover:bg-transparent p-0 font-bold">
                    المبلغ المستهدف ($) <ArrowUpDown className="mr-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead className="text-right">المبلغ الحالي</TableHead>
                <TableHead className="text-right">التقدم</TableHead>
                <TableHead className="text-right">
                  <Button variant="ghost" onClick={() => handleSort('createdAt')} className="hover:bg-transparent p-0 font-bold">
                    التاريخ <ArrowUpDown className="mr-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead className="text-center">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedCampaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState
                      variant="inline"
                      icon={Heart}
                      title="لا توجد مشاريع نشطة"
                      description={searchQuery || selectedCategory !== 'all' || progressFilter !== 'all'
                        ? "لا يوجد مشروع يطابق التصفية الحالية. جرّب توسيع نطاق البحث."
                        : "ابدأ بإنشاء أول مشروع تبرع ليظهر على الموقع."}
                      action={
                        <Button onClick={() => window.location.href = '/dashboard/campaigns/new'} className="bg-brand hover:bg-brand-dark gap-2">
                          <Plus className="w-4 h-4" />
                          إنشاء مشروع جديد
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : paginatedCampaigns.map(campaign => (
                <TableRow key={campaign.id}>
                  <TableCell className="font-medium">{campaign.title}</TableCell>
                  <TableCell>{(campaign.categories ?? (campaign.category ? [campaign.category] : [])).map((c) => c.name).join(' • ') || '—'}</TableCell>
                  <TableCell>${campaign.targetAmount.toLocaleString()}</TableCell>
                  <TableCell>${campaign.currentAmount.toLocaleString()}</TableCell>
                  <TableCell>
                    {!showCampaignProgress(campaign.goalType) ? "—" : (() => {
                      // Was dividing by campaign.targetAmount unguarded: a non-OPEN campaign
                      // with targetAmount 0 rendered "NaN%" (0/0) or "Infinity%" (n/0) and an
                      // invalid CSS width. computeCampaignProgressPercent already clamps and
                      // returns 0 for an invalid target — the same helper the rest of the app
                      // uses, so the table now agrees with every other progress display.
                      const pct = computeCampaignProgressPercent(
                        campaign.currentAmount,
                        campaign.targetAmount,
                        campaign.goalType
                      );
                      return (
                        <div className="space-y-1 min-w-[5rem]">
                          <div className="w-full bg-muted rounded-full h-2.5">
                            <div className="bg-brand h-2.5 rounded-full transition-all"
                              style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {Math.round(pct)}%
                          </span>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>{format(new Date(campaign.createdAt), 'PPP', { locale: ar })}</TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>إجراءات</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => router.push(`/${locale}/campaign/${(campaign as any).slug || campaign.id}`)}>
                            <Eye className="w-4 h-4 ml-2" /> عرض
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push(`/dashboard/campaigns/edit/${campaign.id}`)}>
                            <Edit className="w-4 h-4 ml-2" /> تعديل
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-amber-600 focus:text-amber-600 focus:bg-amber-50"
                            disabled={actionLoading === campaign.id}
                            onClick={() => handleDeactivate(campaign)}
                          >
                            {actionLoading === campaign.id
                              ? <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                              : <PowerOff className="w-4 h-4 ml-2" />}
                            تعطيل
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600 focus:bg-red-50"
                            disabled={actionLoading === campaign.id}
                            onClick={() => handleDelete(campaign)}
                          >
                            {actionLoading === campaign.id
                              ? <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                              : <Trash2 className="w-4 h-4 ml-2" />}
                            حذف
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col gap-3 sm:flex-row items-center justify-between p-3 sm:p-4 border-t border-border">
          <div className="text-sm text-muted-foreground order-2 sm:order-1">
            {filteredCampaigns.length === 0 ? '0' : `${(page - 1) * itemsPerPage + 1} – ${Math.min(page * itemsPerPage, filteredCampaigns.length)}`} من {filteredCampaigns.length}
          </div>
          <div className="flex gap-2 order-1 sm:order-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>السابق</Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page * itemsPerPage >= filteredCampaigns.length}>التالي</Button>
          </div>
        </div>
      </Card>

      {/* ── Archive dialog ── */}
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent className="max-w-3xl w-full max-h-[80vh] flex flex-col" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <Archive className="w-5 h-5" />
              أرشيف المشاريع المعطّلة ({archivedCampaigns.length})
            </DialogTitle>
          </DialogHeader>

          <div className="relative mb-3">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input placeholder="بحث في الأرشيف..." value={archiveSearch} onChange={e => setArchiveSearch(e.target.value)} className="pr-10" />
          </div>

          <div className="overflow-y-auto flex-1 rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">عنوان المشروع</TableHead>
                  <TableHead className="text-right">الحملة</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-center w-32">إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredArchive.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                      لا توجد مشاريع في الأرشيف
                    </TableCell>
                  </TableRow>
                ) : filteredArchive.map(campaign => (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-medium">{campaign.title}</TableCell>
                    <TableCell>{(campaign.categories ?? (campaign.category ? [campaign.category] : [])).map((c) => c.name).join(' • ') || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(campaign.createdAt), 'PP', { locale: ar })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 justify-center">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 h-8"
                          disabled={actionLoading === campaign.id}
                          onClick={() => handleReactivate(campaign)}
                        >
                          {actionLoading === campaign.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <RotateCcw className="w-3.5 h-3.5" />}
                          إعادة تفعيل
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50 h-8"
                          disabled={actionLoading === campaign.id}
                          onClick={() => handleDelete(campaign)}
                          title="حذف نهائي مع الاحتفاظ بسجل التبرعات"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          حذف
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Confirm dialog ── */}
      <AlertDialog open={confirmDialog.open} onOpenChange={open => setConfirmDialog(d => ({ ...d, open }))}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className={confirmDialog.actionClassName}
              onClick={() => {
                setConfirmDialog(d => ({ ...d, open: false }));
                confirmDialog.onConfirm();
              }}
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : confirmDialog.actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const LoadingSkeleton = () => (
  <div>
    <PageHeaderSkeleton />
    <FilterBarSkeleton />
    <TableSkeleton rows={8} columns={7} />
  </div>
);
