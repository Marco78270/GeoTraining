import { useQuery } from "@tanstack/react-query";
import { billingKeys, getBillingApi, type BillingApi } from "./billingApi";

export function useBillingStatus(billingApi: BillingApi = getBillingApi()) {
  return useQuery({
    queryKey: billingKeys.current(),
    queryFn: () => billingApi.loadCurrent(),
  });
}
