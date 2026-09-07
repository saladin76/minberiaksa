'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import {useRouter} from 'next/navigation';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { Plus, Pencil, Trash2, Loader2, ArrowUpDown, Search, Crown, Archive, PowerOff, RotateCcw, Globe } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { FilterBar } from '@/components/dashboard/FilterBar';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { PageHeaderSkeleton, FilterBarSkeleton, TableSkeleton } from '@/components/dashboard/skeletons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ReorderDialog } from './_components/ReorderDialog';
import { CategoryCampaignPriorityDialog } from './_components/CategoryCampaignPriorityDialog';
import { ContentLocalizationAuditCard } from '../_components/ContentLocalizationAuditCard';

interface Category {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  campaigns: {
    id: string;
  }[];
  order: number;
  isActive: boolean;
}

export default function CategoriesPage() {
  const router = useRouter();
  const locale = useLocale() as string;
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<keyof Category>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [campaignsFilter, setCampaignsFilter] = useState<'all' | 'with' | 'without'>('all');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [itemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [priorityDialog, setPriorityDialog] = useState<{ id: string; name: string } | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    actionLabel: string;
    actionClassName: string;
    onConfirm: () => void;
  }>({
    open: false,
    title: '',
    description: '',
    actionLabel: '',
    actionClassName: '',
    onConfirm: () => undefined,
  });

  useEffect(() => {
    fetchCategories();
  }, [locale]);

  const fetchCategories = async () => {
    try {
      // Request localized categories and counts only for performance.
      // isActiveFalse=true returns archived categories too — the dashboard
      // needs both the active table and the archive viewer.
      const response = await axios.get('/api/categories/detailed', {
        params: {
          locale: locale || 'ar',
          counts: true,
          includeCampaigns: false,
          limit: 200,
          isActiveFalse: true,
        }
      });

      const payload = response.data?.items || response.data || [];

      // Normalize categories to ensure `campaigns` array exists (may be omitted for performance)
      const normalized: Category[] = payload.map((c: any) => ({
        id: c.id,
        name: c.name,
        description: c.description ?? null,
        image: c.image ?? null,
        order: c.order ?? 0,
        isActive: c.isActive !== false,
        // If full campaigns were not returned, keep an empty array and preserve `campaignCount` via type cast when needed
        campaigns: Array.isArray(c.campaigns) ? c.campaigns : [],
        // attach a readable campaignCount for display when available
        ...(typeof c.campaignCount === 'number' ? { campaignCount: c.campaignCount } : {})
      }));

      setCategories(normalized);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error('فشل في تحميل الحملات');
    } finally {
      setLoading(false);
    }
  };

  const setActive = async (category: Category, nextActive: boolean) => {
    if (actionLoading) return;
    setActionLoading(category.id);
    try {
      const res = await axios.patch(`/api/categories/${category.id}`, { isActive: nextActive });
      const cascaded = res.data?.cascadedCampaigns ?? 0;
      setCategories(prev => prev.map(c => c.id === category.id ? { ...c, isActive: nextActive } : c));
      toast.success(
        nextActive
          ? `تم تفعيل الحملة وتفعيل ${cascaded} مشروع تابع`
          : `تم تعطيل الحملة وتعطيل ${cascaded} مشروع تابع`
      );
    } catch (err: any) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error || err.message : 'تعذّر تحديث حالة الحملة';
      toast.error(typeof msg === 'string' ? msg : 'تعذّر تحديث حالة الحملة');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeactivate = (category: Category) => {
    const count = (category as any).campaignCount ?? category.campaigns.length;
    setConfirmDialog({
      open: true,
      title: 'تعطيل الحملة',
      description: count > 0
        ? `سيتم إخفاء حملة "${category.name}" من الموقع، وسيتم تعطيل جميع المشاريع التابعة لها (${count} مشروع). يمكنك إعادة التفعيل لاحقاً.`
        : `سيتم إخفاء حملة "${category.name}" من الموقع. يمكنك إعادة تفعيلها في أي وقت.`,
      actionLabel: 'تعطيل',
      actionClassName: 'bg-amber-600 hover:bg-amber-700 text-white',
      onConfirm: () => setActive(category, false),
    });
  };

  const handleReactivate = (category: Category) => {
    const count = (category as any).campaignCount ?? category.campaigns.length;
    setConfirmDialog({
      open: true,
      title: 'إعادة تفعيل الحملة',
      description: count > 0
        ? `سيتم نشر حملة "${category.name}" على الموقع، وسيتم إعادة تفعيل جميع المشاريع التابعة لها (${count} مشروع).`
        : `سيتم نشر حملة "${category.name}" على الموقع مجدداً.`,
      actionLabel: 'تفعيل',
      actionClassName: 'bg-emerald-600 hover:bg-emerald-700 text-white',
      onConfirm: () => setActive(category, true),
    });
  };

  const handleSort = (field: keyof Category) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleDelete = async (category: Category) => {
    const count = (category as any).campaignCount ?? (category.campaigns?.length ?? 0);
    if (count > 0) {
      toast.error('لا يمكن حذف حملة تحتوي على مشاريع');
      return;
    }
    setCategoryToDelete(category);
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`هل أنت متأكد من حذف ${selectedCategories.length} حملة؟`)) return;
    
    setDeleteLoading(true);
    try {
      await Promise.all(
        selectedCategories.map(id => axios.delete(`/api/categories/${id}`))
      );
      toast.success('تم حذف الحملات المحددة بنجاح');
      fetchCategories();
      setSelectedCategories([]);
    } catch (error) {
      console.error('Error deleting categories:', error);
      toast.error('فشل في حذف الحملات');
    } finally {
      setDeleteLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!categoryToDelete) return;

    setDeleteLoading(true);
    try {
      await axios.delete(`/api/categories/${categoryToDelete.id}`);
      toast.success('تم حذف الحملة بنجاح');
      fetchCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error('فشل في حذف الحملة');
    } finally {
      setDeleteLoading(false);
      setCategoryToDelete(null);
    }
  };

  const handleSelectCategory = (categoryId: string) => {
    setSelectedCategories(prev => {
      if (prev.includes(categoryId)) {
        return prev.filter(id => id !== categoryId);
      } else {
        return [...prev, categoryId];
      }
    });
  };

  const handleSelectAllCategories = () => {
    if (selectedCategories.length === filteredCategories.length) {
      setSelectedCategories([]);
    } else {
      setSelectedCategories(filteredCategories.map(category => category.id));
    }
  };

  // Main table shows active only; archived live in the archive dialog (matches
  // the campaigns page convention).
  const activeCategories = categories.filter(c => c.isActive);
  const archivedCategories = categories.filter(c => !c.isActive);

  const filteredCategories = activeCategories.filter(category => {
    const matchesSearch =
      category.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (category.description?.toLowerCase() || '').includes(searchQuery.toLowerCase());

    const count = (category as any).campaignCount ?? category.campaigns.length;
    const matchesCampaignsFilter =
      campaignsFilter === 'all' ||
      (campaignsFilter === 'with' && count > 0) ||
      (campaignsFilter === 'without' && count === 0);

    return matchesSearch && matchesCampaignsFilter;
  });

  const filteredArchive = archivedCategories.filter(c => {
    if (!archiveSearch) return true;
    const q = archiveSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.description?.toLowerCase() || '').includes(q)
    );
  });

  // Sort categories
  const sortedCategories = [...filteredCategories].sort((a, b) => {
    if (sortField === 'name') {
      return sortDirection === 'asc'
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name);
    }
    return 0;
  });

  // Pagination
  const totalPages = Math.ceil(sortedCategories.length / itemsPerPage);
  const paginatedCategories = sortedCategories.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  if (loading) {
    return <LoadingSkeleton />;
  }

  return (
    <div>
      <PageHeader
        title="الحملات"
        description="إدارة الحملات ومشاريعها"
        icon={Globe}
        actions={
          <>
            {selectedCategories.length > 0 && (
              <Button
                variant="destructive"
                onClick={handleBulkDelete}
                disabled={deleteLoading}
                className="gap-2"
              >
                {deleteLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                حذف ({selectedCategories.length})
              </Button>
            )}
            <ReorderDialog categories={categories} onReorder={fetchCategories} />
            <Button
              variant="outline"
              className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
              onClick={() => setArchiveOpen(true)}
            >
              <Archive className="w-4 h-4" />
              أرشيف الحملات
              {archivedCategories.length > 0 && (
                <span className="bg-amber-100 text-amber-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {archivedCategories.length}
                </span>
              )}
            </Button>
            <Button
              onClick={() => router.push('/dashboard/categories/new')}
              className="bg-brand hover:bg-brand-dark gap-2"
            >
              <Plus className="w-4 h-4" />
              حملة جديدة
            </Button>
          </>
        }
      />

      <div className="mb-4">
        <ContentLocalizationAuditCard section="categories" />
      </div>

      <FilterBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="ابحث عن حملة..."
      >
        <Select
          value={campaignsFilter}
          onValueChange={(value: 'all' | 'with' | 'without') => setCampaignsFilter(value)}
        >
          <SelectTrigger className="h-9 w-full sm:w-[180px]">
            <SelectValue placeholder="المشاريع" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الحملات</SelectItem>
            <SelectItem value="with">حملات بها مشاريع</SelectItem>
            <SelectItem value="without">حملات بدون مشاريع</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      <div className="rounded-lg border border-border bg-card overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <input
                  type="checkbox"
                  checked={filteredCategories.length > 0 && selectedCategories.length === filteredCategories.length}
                  onChange={handleSelectAllCategories}
                  className="rounded border-input accent-primary"
                />
              </TableHead>
              <TableHead 
                className="cursor-pointer"
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center gap-2">
                  اسم الحملة
                  <ArrowUpDown className="w-4 h-4" />
                </div>
              </TableHead>
              <TableHead className="text-start">الوصف</TableHead>
              <TableHead className="text-start">عدد المشاريع</TableHead>
              <TableHead className="text-start">الصورة</TableHead>
              <TableHead className="text-center">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>

            {paginatedCategories.map((category) => (
              <TableRow key={category.id}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(category.id)}
                    onChange={() => handleSelectCategory(category.id)}
                  className="rounded border-input accent-primary"
                />
              </TableCell>
              <TableCell className="font-medium">{category.name}</TableCell>
                <TableCell className='max-w-[300px] truncate pl-12'>{category.description || 'لا يوجد وصف'}</TableCell>
                <TableCell>{(category as any).campaignCount ?? 0}</TableCell>
                <TableCell>
                  {category.image ? (
                    <img
                      src={category.image}
                      alt={category.name}
                      className="w-10 h-10 rounded-lg object-cover"
                    />
                  ) : (
                    'لا توجد صورة'
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setPriorityDialog({ id: category.id, name: category.name })}
                      className="text-amber-600 hover:bg-amber-50"
                      title="أولويات المشاريع داخل الحملة"
                    >
                      <Crown className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => router.push(`/dashboard/categories/edit/${category.id}`)}
                      className="text-primary hover:bg-primary/10"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeactivate(category)}
                      className="text-amber-600 hover:bg-amber-50"
                      disabled={actionLoading === category.id}
                      title="تعطيل الحملة وأرشفتها"
                    >
                      {actionLoading === category.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <PowerOff className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(category)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      disabled={((category as any).campaignCount ?? category.campaigns.length) > 0}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}

            {paginatedCategories.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="p-0">
                  <EmptyState
                    variant="inline"
                    icon={Globe}
                    title="لا توجد حملات"
                    description={searchQuery || campaignsFilter !== 'all'
                      ? "لا توجد حملة تطابق التصفية الحالية."
                      : "الحملات تجمع المشاريع تحت مظلة واحدة. أنشئ أول حملة للبدء."}
                    action={
                      <Button
                        onClick={() => router.push('/dashboard/categories/new')}
                        className="bg-brand hover:bg-brand-dark gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        إضافة حملة جديدة
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 bg-white border-t">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                السابق
              </Button>
              <span className="text-sm text-gray-600">
                صفحة {currentPage} من {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
              >
                التالي
              </Button>
            </div>
            <div className="text-sm text-gray-600">
              إجمالي النتائج: {sortedCategories.length}
            </div>
          </div>
        )}
      </div>

      {priorityDialog && (
        <CategoryCampaignPriorityDialog
          open={!!priorityDialog}
          onOpenChange={(open) => { if (!open) setPriorityDialog(null); }}
          categoryId={priorityDialog.id}
          categoryName={priorityDialog.name}
        />
      )}

      {/* ── Archive viewer ── */}
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent className="max-w-3xl w-full max-h-[80vh] flex flex-col" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <Archive className="w-5 h-5" />
              أرشيف الحملات المعطّلة ({archivedCategories.length})
            </DialogTitle>
          </DialogHeader>

          <div className="relative mb-3">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="بحث في الأرشيف..."
              value={archiveSearch}
              onChange={e => setArchiveSearch(e.target.value)}
              className="pr-10"
            />
          </div>

          <div className="overflow-y-auto flex-1 rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">اسم الحملة</TableHead>
                  <TableHead className="text-right">عدد المشاريع</TableHead>
                  <TableHead className="text-center w-40">إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredArchive.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-10 text-muted-foreground">
                      لا توجد حملات في الأرشيف
                    </TableCell>
                  </TableRow>
                ) : filteredArchive.map(category => (
                  <TableRow key={category.id}>
                    <TableCell className="font-medium">{category.name}</TableCell>
                    <TableCell>{(category as any).campaignCount ?? 0}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 h-8"
                        disabled={actionLoading === category.id}
                        onClick={() => handleReactivate(category)}
                      >
                        {actionLoading === category.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <RotateCcw className="w-3.5 h-3.5" />}
                        إعادة تفعيل
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Activate/deactivate confirm ── */}
      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={open => setConfirmDialog(d => ({ ...d, open }))}
      >
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

      <AlertDialog
        open={!!categoryToDelete}
        onOpenChange={() => setCategoryToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد من حذف هذه الحملة؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الحملة نهائياً ولا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 gap-2"
              disabled={deleteLoading}
            >
              {deleteLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              حذف
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
    <TableSkeleton rows={6} columns={6} />
  </div>
);
