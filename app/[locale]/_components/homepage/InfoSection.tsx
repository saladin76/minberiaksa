import { Link } from "@/i18n/routing";
import Image from "next/image";

const sections = [
  {
    title: "عن يدي جيهان",
    description: "تنمية قدرات الفرد، وتوفير الدعم لمستحقيه من أجل مجتمع أفضل.",
    image: "/who-are-us.jpg", // استبدل بمسار الصورة الفعلي
    link: "/about-us",
  },
  {
    title: "انضم لنا",
    description: "شارك قيمك مع فريق يشاركك الاهتمامات نفسها.",
    image: "/join-us.jpeg", // استبدل بمسار الصورة الفعلي
    link: "/about-us",
  },
];

const InfoSection = () => {
  return (
    <div className="bg-gray-100 py-10 px-6 flex justify-center">
      <div className="container w-full grid grid-cols-1 md:grid-cols-2 gap-6">
        {sections.map((section, index) => (
          <div
            key={index}
            className="relative rounded-3xl h-[450px] overflow-hidden text-white flex items-center justify-center"
          >
            <Image
              src={section.image}
              alt={section.title}
              layout="fill"
              objectFit="cover"
              className="absolute inset-0 z-0"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-teal-900/75 to-black/75 z-10"></div>
            <div className="relative z-20 text-center px-6 flex flex-col items-center justify-between h-[250px]">
              <h2 className="text-5xl font-bold mb-2">{section.title}</h2>
              <p className="text-lg mb-4">{section.description}</p>
              <Link href={section.link} className="text-white font-semibold underline">
                التفاصيل &gt;
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default InfoSection;
