import type { TourProvider, TourProviderId } from "@/lib/tour-providers/types";
import { samoProvider } from "@/lib/server/tour-providers/samo";

const PROVIDERS: Record<TourProviderId, TourProvider> = {
  samo: samoProvider,
};

export function getTourProvider(id: TourProviderId = "samo") {
  return PROVIDERS[id];
}
