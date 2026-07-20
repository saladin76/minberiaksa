import { utilityNavigation } from "@/config/navigation";
import { Container } from "@/components/ui/container";
export function TopUtilityBar(){return <div className="top-utility-bar"><Container className="top-utility-inner"><p>مؤسسة دولية متخصصة في القدس والأقصى وغزة</p><nav aria-label="روابط مساندة">{utilityNavigation.map((item)=><a href={item.href} key={item.href}>{item.label}</a>)}</nav></Container></div>}
