"use client";
import { cn } from "@/lib/utils";

type VideoCardProps = {
  title?: string;
  description?: string;
  before?: string;
  after?: string;
};

export function VideoCard({
  title,
  description,
  before,
  after,
}: VideoCardProps) {
  const defaultBefore = "https://images.unsplash.com/photo-1476842634003-7dcca8f832de?ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&ixlib=rb-1.2.1&auto=format&fit=crop&w=1650&q=80";
  const defaultAfter = "https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExNWlodTF3MjJ3NnJiY3Rlc2J0ZmE0c28yeWoxc3gxY2VtZzA5ejF1NSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/syEfLvksYQnmM/giphy.gif";

  return (
    <div className="max-w-xs w-full">
      <div
        className={cn(
          "group w-full cursor-pointer overflow-hidden relative card h-96 rounded-md shadow-xl mx-auto flex flex-col justify-end p-4 border border-transparent dark:border-neutral-800",
          "bg-cover transition-all duration-500"
        )}
        style={{
          backgroundImage: `url(${before || defaultBefore})`,
          "--hover-bg": `url(${after || defaultAfter})`
        } as React.CSSProperties}
        onMouseEnter={(e) => {
          const target = e.currentTarget;
          target.style.backgroundImage = `url(${after || defaultAfter})`;
        }}
        onMouseLeave={(e) => {
          const target = e.currentTarget;
          target.style.backgroundImage = `url(${before || defaultBefore})`;
        }}
      >
        <div className="text relative z-50">
          <h1 className="font-bold text-xl md:text-3xl text-gray-50 relative">
            {title || "Background Overlays"}
          </h1>
          <p className="font-normal text-base text-gray-50 relative my-4">
            {description ||
              "This card is for some special elements, like displaying background gifs on hover only."}
          </p>
        </div>
      </div>
    </div>
  );
}