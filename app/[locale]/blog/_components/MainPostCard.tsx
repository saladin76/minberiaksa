import Image from "next/image";
import { Link } from "@/i18n/routing";

interface PostCardProps {
  post: Post;
}

export const PostCard: React.FC<PostCardProps> = ({ post }) => {
  return (
    <Link href={`/blog/${(post as any).slug || post.id}`} className="bg-white rounded-lg shadow-lg overflow-hidden transition-all duration-300 hover:shadow-xl">
      {post.image && (
        <div className="relative h-48 w-full">
          <Image
            src={post.image}
            alt={post.title || "Blog post"}
            layout="fill"
            objectFit="cover"
          />
        </div>
      )}
      <div className="p-6">
        <h3 className="text-xl font-bold mb-2 text-gray-800">{post.title}</h3>
        <p className="text-sm text-gray-500 line-clamp-3">{post.description}</p>
        <div className="mt-4 flex justify-between items-center">
          <span className="text-sm text-gray-500">
            {new Date(post.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>
    </Link>
  );
};
