import { useQuery } from "@tanstack/react-query";
import type { CollectionSummary } from "../collections/collectionApi";
import { getAdminApi, type PlatformRole } from "./adminApi";
import { adminKeys } from "./adminKeys";

export function isPlatformAdmin(role: PlatformRole | null | undefined) {
  return role === "admin" || role === "super_admin";
}

export function canAdministerCollection(
  collection:
    | Pick<CollectionSummary, "role" | "visibility">
    | null
    | undefined,
  platformRole: PlatformRole | null | undefined,
) {
  if (!collection) {
    return false;
  }

  if (collection.role === "owner") {
    return true;
  }

  return (
    collection.visibility === "public_readonly" &&
    isPlatformAdmin(platformRole)
  );
}

export function canWriteCollectionContent(
  collection:
    | Pick<CollectionSummary, "role" | "visibility">
    | null
    | undefined,
  platformRole: PlatformRole | null | undefined,
) {
  if (!collection) {
    return false;
  }

  if (collection.role === "owner" || collection.role === "editor") {
    return true;
  }

  return canAdministerCollection(collection, platformRole);
}

export function usePlatformRole(platformRole?: PlatformRole | null) {
  const roleQuery = useQuery({
    queryKey: adminKeys.role(),
    queryFn: () => getAdminApi().getCurrentPlatformRole(),
    enabled: platformRole === undefined,
  });

  return platformRole === undefined ? roleQuery.data : platformRole;
}
