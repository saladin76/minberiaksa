'use client';

import { useState } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { toast } from 'react-hot-toast';
import { ArrowUpDown, GripVertical, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import axios from 'axios';

interface Category {
  id: string;
  name: string;
  order: number;
}

interface DraggableCategoryProps {
  category: Category;
  index: number;
  moveCategory: (dragIndex: number, hoverIndex: number) => void;
}

const DraggableCategory = ({ category, index, moveCategory }: DraggableCategoryProps) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'CATEGORY',
    item: { index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [, drop] = useDrop({
    accept: 'CATEGORY',
    hover: (item: { index: number }) => {
      if (item.index === index) return;
      moveCategory(item.index, index);
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
      <span className="flex-1">{category.name}</span>
      <span className="text-sm text-gray-500">#{index + 1}</span>
    </div>
  );
};

export const ReorderDialog = ({ categories, onReorder }: { 
  categories: Category[],
  onReorder: () => void 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [orderedCategories, setOrderedCategories] = useState<Category[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setOrderedCategories([...categories].sort((a, b) => a.order - b.order));
    }
    setIsOpen(open);
  };

  const moveCategory = (dragIndex: number, hoverIndex: number) => {
    const draggedCategory = orderedCategories[dragIndex];
    const newCategories = [...orderedCategories];
    newCategories.splice(dragIndex, 1);
    newCategories.splice(hoverIndex, 0, draggedCategory);
    setOrderedCategories(newCategories);
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      const updatedCategories = orderedCategories.map((category, index) => ({
        id: category.id,
        order: index,
      }));

      await axios.post('/api/categories/reorder', {
        categories: updatedCategories,
      });

      toast.success('تم إعادة ترتيب الحملات بنجاح');
      onReorder();
      setIsOpen(false);
    } catch (error) {
      console.error('Error reordering categories:', error);
      toast.error('فشل في إعادة ترتيب الحملات');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <ArrowUpDown className="w-4 h-4" />
          رتب التصنيفات
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>إعادة ترتيب الحملات</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-gray-500 mb-4">
            اسحب وأفلت الحملات لإعادة ترتيبها
          </p>
          <DndProvider backend={HTML5Backend}>
            <div className="max-h-[400px] overflow-y-auto">
              {orderedCategories.map((category, index) => (
                <DraggableCategory
                  key={category.id}
                  category={category}
                  index={index}
                  moveCategory={moveCategory}
                />
              ))}
            </div>
          </DndProvider>
        </div>
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
          >
            إلغاء
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSubmitting}
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