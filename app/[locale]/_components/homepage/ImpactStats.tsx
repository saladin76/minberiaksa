import { HandHeart, HeartPulse, Stethoscope, Syringe, Baby, Hospital, LifeBuoy } from "lucide-react";
import CountUp from "react-countup";

const stats = [
  { value: 125000, label: "مستشفيات", icon: Hospital },
  { value: 4321, label: "إنقاذ عاجل", icon: LifeBuoy },
  { value: 985, label: "أعضاء صناعية", icon: HeartPulse },
  { value: 15000, label: "جرعات دواء", icon: Syringe },
  { value: 318, label: "أطفال ناجون", icon: Baby },
  { value: 8900, label: "عمليات جراحية", icon: HandHeart },
];

const StatCard = ({ icon: Icon, label, value }) => (
  <div className="flex flex-col items-center text-white text-center">
    <Icon className="w-10 h-10 mb-2" />
    <span className="text-3xl font-bold text-green-400">
      <CountUp enableScrollSpy scrollSpyOnce end={value} />
    </span>
    <span className="text-lg">{label}</span>
  </div>
);

const StatsSection = () => {
  return (
    <div className="bg-gradient-to-r from-emerald-950 to-emerald-900 py-10 px-6 flex justify-center items-center">
      <div className="max-w-6xl mx-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
        {stats.map((stat, index) => (
          <StatCard key={index} icon={stat.icon} label={stat.label} value={stat.value} />
        ))}
      </div>
    </div>
  );
};

export default StatsSection;
