import type { Metadata } from "next";
import ProjectPage, { generateMetadata as projectMetadata } from "../[slug]/page";
import type { IncomingSearchParams } from "@/lib/minbar/redirect-query";

type Props = { params: Promise<{ locale: string }>; searchParams?: Promise<IncomingSearchParams> };
const managedParams = (params: Props["params"]) => params.then(({ locale }) => ({ locale, slug: "al-quds-home-restoration" }));

/** This reserved path must use the same CMS, publication and slug rules as every major project. */
export function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  return projectMetadata({ params: managedParams(params), searchParams: searchParams || Promise.resolve({}) });
}
export default function Restoration({ params, searchParams }: Props) {
  return ProjectPage({ params: managedParams(params), searchParams: searchParams || Promise.resolve({}) });
}
