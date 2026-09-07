"use client";

import { Link } from "@/i18n/routing";
import React from "react";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

interface BlogCardProps {
  title: string;
  image: string;
  link?: string;
  description?: string;
}

const BlogCard: React.FC<BlogCardProps> = ({ title, image, link = "#", description }) => {
  const t = useTranslations("BlogCard");
  return (
    <Link href={link} className="group flex flex-col bg-white shape-card overflow-hidden shadow-soft hover:shadow-lift transition-all duration-300 h-full">
      {/* Image */}
      <div className="relative overflow-hidden aspect-[4/3] flex-shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt={title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="image-overlay absolute inset-x-0 bottom-0 h-1/2" />
      </div>

      {/* Body */}
      <div className="p-5 flex flex-col flex-1">
        <div className="gold-mark-sm mb-3" />
        <h3 className="font-bold text-deep text-base mb-2 line-clamp-2 group-hover:text-burgundy transition-colors">
          {title}
        </h3>
        {description && (
          <p className="text-gray-500 text-xs line-clamp-2 mb-3">{description}</p>
        )}
        <span className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-burgundy group-hover:text-burgundyDark transition-colors">
          {t("readMore")} <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
        </span>
      </div>
    </Link>
  );
};

export default BlogCard;
