"use client";

import { Button } from "@/components/ui/button";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Blocks, Eye, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useLocale } from "next-intl";

export interface BlogRow {
  id: string;
  slug?: string | null;
  title: string | null;
  description: string | null;
  content: string | null;
  image: string | null;
  published: boolean;
  category: { id: string; slug?: string | null; name: string } | null;
  categoryId?: string | null;
  createdAt: string;
  updatedAt: string;
}

function BlogRowActions({
  row,
  onDelete,
}: {
  row: BlogRow;
  onDelete: (id: string) => void | Promise<void>;
}) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const locale = useLocale()
  const { id } = row;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">فتح القائمة</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link
              className="flex w-full justify-end items-center text-black"
              href={`/${locale}/blog/${row.slug || id}`}
            >
              عرض
              <Eye className="h-4 w-4 ml-2" />
            </Link>
          </DropdownMenuItem>
          {row.category?.id && (
            <DropdownMenuItem asChild>
              <Link
                className="flex w-full justify-end items-center text-black"
                href={`/${locale}/blog/category/${row.category.slug || row.category.id}`}
              >
                عرض التصنيف
                <Blocks className="h-4 w-4 ml-2" />
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link
              className="flex w-full justify-end items-center text-black"
              href={`/dashboard/blog/create/${id}`}
            >
              تعديل
              <Pencil className="h-4 w-4 ml-2" />
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex w-full justify-end items-center text-red-600 focus:text-red-600"
            onSelect={(e) => {
              e.preventDefault();
              setShowDeleteDialog(true);
            }}
          >
            حذف
            <Trash2 className="h-4 w-4 ml-2" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المقال</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذا المقال؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-700 hover:bg-red-800"
              onClick={async () => {
                await onDelete(id);
                setShowDeleteDialog(false);
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function getBlogColumns(onDelete: (id: string) => void | Promise<void>): ColumnDef<BlogRow>[] {
  return [
  {
    id: "image",
    accessorKey: "image",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          الصورة
          <ArrowUpDown className="mx-2 h-[14px] w-[14px]" />
        </Button>
      );
    },
    cell: ({ row }) => {
      return (
        <Image
          src={
            row.original.image ||
            "https://division.iium.edu.my/amad/wp-content/uploads/sites/2/2023/07/placeholder-282.png"
          }
          alt={row.original.title || "صورة المقال"}
          width={110}
          height={110}
          quality={95}
          className="rounded-md object-cover"
        />
      );
    },
  },
  {
    accessorKey: "title",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          عنوان
          <ArrowUpDown className="mr-2 h-[14px] w-[14px]" />
        </Button>
      );
    },
    cell: ({ row }) => <div>{row.original.title || "_"}</div>,
  },
  {
    id: "category",
    accessorKey: "category",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          التصنيف
          <ArrowUpDown className="mr-2 h-[14px] w-[14px]" />
        </Button>
      );
    },
    cell: ({ row }) => <div>{row.original.category?.name || "_"}</div>,
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <BlogRowActions row={row.original} onDelete={onDelete} />
    ),
  },
  ];
}
