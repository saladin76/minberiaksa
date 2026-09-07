'use client';

import { useState, useEffect } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { toast } from 'react-hot-toast';
import { Check, ChevronsUpDown, Crown, GripVertical, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import axios from 'axios';

interface Campaign {
  id: string;
  title: string;
}

interface DraggableCampaignProps {
  campaign: Campaign;
  index: number;
  moveCampaign: (dragIndex: number, hoverIndex: number) => void;
}

const DraggableCampaign = ({ campaign, index, moveCampaign }: DraggableCampaignProps) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'CATEGORY_CAMPAIGN',
    item: { index },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  const [, drop] = useDrop({
    accept: 'CATEGORY_CAMPAIGN',
    hover: (item: { index: number }) => {
      if (item.index === index) return;
      moveCampaign(item.index, index);
      item.index = index;
    },
  });

  return (
    <div
      ref={(node) => drag(drop(node))}
      className={`flex items-center gap-3 p-3 bg-white border rounded-lg mb-2 ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <GripVertical className="w-5 h-5 text-gray-400 cursor-move" />
      <span className="flex-1">{campaign.title}</span>
      <span className="text-sm text-gray-500">#{index + 1}</span>
    </div>
  );
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  categoryName: string;
  onSaved?: () => void;
}

export const CategoryCampaignPriorityDialog = ({
  open,
  onOpenChange,
  categoryId,
  categoryName,
  onSaved,
}: Props) => {
  const [comboOpen, setComboOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaigns, setSelectedCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load campaigns for this category + current priority list
  useEffect(() => {
    if (!open || !categoryId) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const [allRes, priRes] = await Promise.all([
          axios.get(`/api/categories/${categoryId}/campaigns`, {
            params: { limit: 100, isActive: true },
          }),
          axios.get(`/api/categories/${categoryId}/prioritized-campaigns`),
        ]);
        if (cancelled) return;

        const items = (allRes.data?.items || []) as Campaign[];
        const prioritized = (priRes.data || []) as Campaign[];

        setCampaigns(items);
        // Preserve saved order from the API
        setSelectedCampaigns(
          prioritized
            .map((p) => items.find((c) => c.id === p.id) ?? { id: p.id, title: p.title })
            .filter(Boolean) as Campaign[]
        );
      } catch (err) {
        console.error(err);
        toast.error('فشل في تحميل المشاريع');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, categoryId]);

  const handleSelectCampaign = (campaignId: string) => {
    const campaign = campaigns.find((c) => c.id === campaignId);
    if (!campaign) return;

    if (selectedCampaigns.length >= 12) {
      toast.error('يمكنك اختيار 12 مشروع كحد أقصى');
      return;
    }
    if (selectedCampaigns.some((c) => c.id === campaignId)) {
      toast.error('هذا المشروع مضاف بالفعل');
      return;
    }
    setSelectedCampaigns((prev) => [...prev, campaign]);
  };

  const removeCampaign = (campaignId: string) => {
    setSelectedCampaigns((prev) => prev.filter((c) => c.id !== campaignId));
  };

  const moveCampaign = (dragIndex: number, hoverIndex: number) => {
    const dragged = selectedCampaigns[dragIndex];
    const next = [...selectedCampaigns];
    next.splice(dragIndex, 1);
    next.splice(hoverIndex, 0, dragged);
    setSelectedCampaigns(next);
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      const payload = selectedCampaigns.map((c, index) => ({ id: c.id, order: index }));
      await axios.post(`/api/categories/${categoryId}/prioritized-campaigns`, {
        campaigns: payload,
      });
      toast.success('تم إعادة ترتيب المشاريع بنجاح');
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error('فشل في إعادة ترتيب المشاريع');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-brand" />
            أولويات المشاريع — {categoryName}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-gray-500 mb-4">
            اختر المشاريع التي تريد عرضها بالترتيب داخل هذه الحملة. الحد الأقصى 12 مشروعًا.
            <br />
            <span className="text-xs mt-1 block">
              ({selectedCampaigns.length}/12 مشاريع مختارة)
            </span>
          </p>

          <Popover open={comboOpen} onOpenChange={setComboOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={comboOpen}
                className="w-full justify-between font-normal text-muted-foreground"
                disabled={isLoading}
              >
                {isLoading ? 'جارٍ التحميل…' : 'اختر مشروع لإضافتها'}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-full p-0"
              align="start"
              style={{ width: 'var(--radix-popover-trigger-width)' }}
            >
              <Command>
                <CommandInput placeholder="ابحث عن مشروع..." />
                <CommandList>
                  <CommandEmpty>لا توجد نتائج</CommandEmpty>
                  <CommandGroup>
                    {campaigns
                      .filter((c) => !selectedCampaigns.some((sc) => sc.id === c.id))
                      .map((campaign) => (
                        <CommandItem
                          key={campaign.id}
                          value={campaign.title}
                          onSelect={() => {
                            handleSelectCampaign(campaign.id);
                            setComboOpen(false);
                          }}
                        >
                          <Check className="mr-2 h-4 w-4 opacity-0" />
                          {campaign.title}
                        </CommandItem>
                      ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <DndProvider backend={HTML5Backend}>
            <div className="mt-4 space-y-2">
              {selectedCampaigns.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  لم يتم اختيار أي مشاريع بعد
                </p>
              ) : (
                <div className="max-h-[400px] overflow-y-auto">
                  {selectedCampaigns.map((campaign, index) => (
                    <div key={campaign.id} className="relative">
                      <DraggableCampaign
                        campaign={campaign}
                        index={index}
                        moveCampaign={moveCampaign}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-2 left-2 h-6 w-6 p-0"
                        onClick={() => removeCampaign(campaign.id)}
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DndProvider>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSubmitting || isLoading}
            className="gap-2"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            حفظ الترتيب
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
