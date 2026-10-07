'use client';

import { useState, useEffect } from 'react';
import { useDebounce } from 'use-debounce';
import axios from 'axios';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Plus,
  Search,
  Edit,
  Trash2,
  Eye,
  ArrowUpDown,
  Download,
  Loader2,
  MoreVertical,
  Link2,
  HandHeart,
} from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { PageHeaderSkeleton, FilterBarSkeleton, TableSkeleton } from '@/components/dashboard/skeletons';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Link, useRouter } from "@/i18n/routing";
import { toast } from 'react-hot-toast';
import DonationCountryFlag from '@/components/DonationCountryFlag';

/**
 * Sorts by one column, with absent values last in either direction.
 *
 * The comparator this replaced compared `a[sortField] > b[sortField]` directly. Several of these
 * columns are nullable  a donation with no donor name, no completion date  and comparing `null`
 * with `>` is always false, so those rows sorted into an arbitrary position that flipped depending on
 * which side of the comparison they landed on. Sorting them to the end is both stable and what a
 * reader expects from an empty cell.
 */
function compareBySortField(
  a: Donation,
  b: Donation,
  field: keyof Donation,
  direction: 'asc' | 'desc',
): number {
  const left = a[field];
  const right = b[field];
  const leftEmpty = left === null || left === undefined;
  const rightEmpty = right === null || right === undefined;
  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;
  const order = left < right ? -1 : left > right ? 1 : 0;
  return direction === 'asc' ? order : -order;
}

interface Donation {
  id: string;
  amount: number;
  amountUSD: number;
  currency: string;
  teamSupport: number;
  coverFees: boolean;
  fees: number;
  totalAmount: number;
  donorCountryCode?: string | null;
  donorId: string | null;
  donor: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  } | null;
  type: 'ONE_TIME' | 'MONTHLY';
  status: 'ACTIVE' | 'INACTIVE';
  paymentMethod: string | null;
  createdAt: string;
  items: {
    campaign: {
      id: string;
      title: string;
      images: string[];
    };
    amount: number;
    amountUSD: number;
  }[];
}

export default function DonationsPage() {
  const router = useRouter();
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch] = useDebounce(searchQuery.trim(), 300);
  const [sortField, setSortField] = useState<keyof Donation>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [itemsPerPage] = useState(10);
  const [selectedDonations, setSelectedDonations] = useState<string[]>([]);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await axios.get('/api/donations', {
          params: { page, limit: itemsPerPage, search: debouncedSearch || undefined },
        });
        setDonations(response.data.donations);
        setTotalPages(response.data.pagination.pages);
      } catch (error) {
        console.error('Error fetching donations:', error);
        toast.error('Failed to fetch donations');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [page, itemsPerPage, debouncedSearch]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const handleSort = (field: keyof Donation) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this donation?')) return;

    setDeleteLoading(true);
    try {
      await axios.delete(`/api/donations/${id}`);
      setDonations(donations.filter(donation => donation.id !== id));
      toast.success('Donation deleted successfully');
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        toast.error('Paid donations cannot be deleted. Edit it instead.');
      } else {
        console.error('Error deleting donation:', error);
        toast.error('Failed to delete donation');
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedDonations.length} donations?`)) return;

    setDeleteLoading(true);
    try {
      // Paid donations are refused by the API (409), so delete one by one and
      // keep only what the server actually removed.
      const results = await Promise.allSettled(
        selectedDonations.map(id => axios.delete(`/api/donations/${id}`).then(() => id))
      );
      const deleted = results
        .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
        .map(r => r.value);
      const refused = results.length - deleted.length;
      setDonations(donations.filter(donation => !deleted.includes(donation.id)));
      setSelectedDonations([]);
      if (refused === 0) toast.success('Donations deleted successfully');
      else toast.error(`${deleted.length} deleted, ${refused} kept (paid donations cannot be deleted)`);
    } catch (error) {
      console.error('Error deleting donations:', error);
      toast.error('Failed to delete donations');
    } finally {
      setDeleteLoading(false);
    }
  };

  // API search is authoritative and runs before pagination; only sort the current page locally.
  const filteredDonations = [...donations].sort((a, b) =>
    compareBySortField(a, b, sortField, sortDirection)
  );

  const paginatedDonations = filteredDonations;

  const exportToCSV = () => {
    const headers = ['Amount', 'Currency', 'Type', 'Status', 'Payment Method', 'Created At', 'Donor Name', 'Campaigns'];
    const csvData = filteredDonations.map(donation => [
      donation.totalAmount,
      donation.currency,
      donation.type,
      donation.status,
      donation.paymentMethod,
      format(new Date(donation.createdAt), 'PPP', { locale: ar }),
      donation.donor?.name ?? "تحويل بنكي بدون ملف متبرع",
      donation.items.map(item => item.campaign.title).join(', '), // Include campaign titles
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `donations_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  if (loading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="التبرعات"
        description="إدارة تبرعات التبرع"
        icon={HandHeart}
        actions={
          <Button
            onClick={() => router.push('/dashboard/donations/new')}
            className="bg-brand hover:bg-brand-dark gap-2"
          >
            <Plus className="w-4 h-4" />
            تسجيل تبرع
          </Button>
        }
      />

      {/* Filters Section */}
      <Card className="p-4">
        <div className="flex flex-col gap-4">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="البحث في التبرعات..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-4 pr-10"
              />
            </div>
            <Button
              variant="outline"
              className="gap-2"
              onClick={exportToCSV}
            >
              <Download className="w-4 h-4" />
              تصدير CSV
            </Button>
          </div>
        </div>
      </Card>

      {/* Donations Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">
                <input
                  type="checkbox"
                  checked={selectedDonations.length === paginatedDonations.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedDonations(paginatedDonations.map(d => d.id));
                    } else {
                      setSelectedDonations([]);
                    }
                  }}
                  className="w-5 h-5 rounded border border-gray-300 text-brand focus:ring-brand"
                />
              </TableHead>
              <TableHead className="text-right">المتبرع</TableHead>
              <TableHead className="w-10 px-2 text-center">
                <span className="sr-only">دولة المتبرع</span>
              </TableHead>
              <TableHead className="text-right">المبلغ</TableHead>
              <TableHead className="text-right">العملة</TableHead>
              <TableHead className="text-right">النوع</TableHead>
              <TableHead className="text-right">طريقة الدفع</TableHead>
              <TableHead className="text-right">التاريخ</TableHead>
              <TableHead className="text-right">المشاريع</TableHead>
              <TableHead className="text-center">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedDonations.map((donation) => (
              <TableRow key={donation.id}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedDonations.includes(donation.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedDonations([...selectedDonations, donation.id]);
                      } else {
                        setSelectedDonations(selectedDonations.filter(id => id !== donation.id));
                      }
                    }}
                    className="rounded border-gray-300"
                  />
                </TableCell>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {donation.donor?.image ? (
                      <img
                        src={donation.donor.image}
                        alt={donation.donor.name ?? "متبرع"}
                        className="w-8 h-8 rounded-full"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-white font-medium">
                        {(donation.donor?.name ?? "ب").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium">{donation.donor?.name ?? "تحويل بنكي بدون ملف متبرع"}</p>
                      <p className="text-xs text-gray-500">{donation.donor?.email ?? "—"}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="w-10 px-2 text-center align-middle">
                  <DonationCountryFlag countryCode={donation.donorCountryCode} />
                </TableCell>
                <TableCell>{donation.totalAmount.toLocaleString()}</TableCell>
                <TableCell>{donation.currency}</TableCell>
                <TableCell>{donation.type === 'ONE_TIME' ? 'مرة واحدة' : 'شهري'}</TableCell>
                <TableCell>{donation.paymentMethod || '—'}</TableCell>
                <TableCell>
                  {format(new Date(donation.createdAt), 'PPP', { locale: ar })}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    {donation.items.map((item) => (
                      <Link href={`/campaign/${(item.campaign as any).slug || item.campaign.id}`} key={item.campaign.id} className="text-sm text-brand flex gap-2">
                        <Link2 className='w-5 h-5 text-brand' />
                        {item.campaign.title}
                      </Link>
                    ))}
                  </div>
                </TableCell>
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
                        <DropdownMenuItem onClick={() => router.push(`/donations/${donation.id}`)}>
                          <Eye className="w-4 h-4 ml-2" />
                          عرض
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => handleDelete(donation.id)}
                        >
                          <Trash2 className="w-4 h-4 ml-2" />
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

        {/* Pagination */}
        <div className="flex items-center justify-between p-4">
          <div className="text-sm text-gray-600">
            Showing {filteredDonations.length ? ((page - 1) * itemsPerPage) + 1 : 0} to {((page - 1) * itemsPerPage) + filteredDonations.length} · page {page} of {Math.max(totalPages, 1)}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

const LoadingSkeleton = () => (
  <div>
    <PageHeaderSkeleton />
    <FilterBarSkeleton />
    <TableSkeleton rows={8} columns={6} />
  </div>
);