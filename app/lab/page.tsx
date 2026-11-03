import type { Metadata } from "next";
import StyleLab from "@/components/StyleLab";

export const metadata: Metadata = {
  title: "Style Lab — AuraFit",
};

export default function LabPage() {
  return <StyleLab />;
}
