import {
  Building2,
  Camera,
  Car,
  Fence,
  Flag,
  Leaf,
  MapPinned,
  Milestone,
  Route,
  ShieldAlert,
  Signpost,
  TrafficCone,
  UtilityPole,
  type LucideIcon,
} from "lucide-react";

export type CategoryIconOption = {
  value: string;
  label: string;
  Icon: LucideIcon;
};

export const categoryIconOptions: CategoryIconOption[] = [
  { value: "sign", label: "Panneau", Icon: Signpost },
  { value: "milestone", label: "Bollard", Icon: Milestone },
  { value: "road", label: "Route", Icon: Route },
  { value: "pole", label: "Poteau", Icon: UtilityPole },
  { value: "fence", label: "Barrière", Icon: Fence },
  { value: "flag", label: "Drapeau", Icon: Flag },
  { value: "car", label: "Voiture", Icon: Car },
  { value: "camera", label: "Google car", Icon: Camera },
  { value: "marking", label: "Marquage", Icon: TrafficCone },
  { value: "leaf", label: "Végétation", Icon: Leaf },
  { value: "building", label: "Architecture", Icon: Building2 },
  { value: "map", label: "Zone", Icon: MapPinned },
  { value: "shield", label: "Indice", Icon: ShieldAlert },
];

export function getCategoryIcon(value?: string | null) {
  return (
    categoryIconOptions.find((option) => option.value === value) ??
    categoryIconOptions[0]
  );
}
