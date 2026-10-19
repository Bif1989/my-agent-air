import { authenticatedSupabaseFetch } from "@/lib/supabase-auth";

export type SupplierImportItem = {
  supplier_type?: "hotel" | "guide" | "transport" | "restaurant";
  name: string;
  region?: string;
  city?: string;
  district?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  telegram?: string;
  source_type?: string;
  source_name?: string;
  source_url?: string;
  source_record_id?: string;
  registry_number?: string;
  star_rating?: string | number;
  capacity?: string | number;
  price_from?: string | number;
  price_to?: string | number;
  currency?: string;
  price_unit?: string;
  services?: string[];
  source_updated_at?: string;
  metadata?: Record<string, unknown>;
};

export type SupplierStats = {
  total: number;
  hotels: number;
  guides: number;
  transport: number;
  restaurants: number;
  with_phone: number;
  verified_contacts: number;
};

export type SupplierImportResult = {
  inserted: number;
  updated: number;
  skipped: number;
  total: number;
};

export type SupplierLocality = {
  region: string;
  locality: string;
  kind: "city" | "district";
};

export type SupplierFilterOptions = {
  regions: string[];
  localities: SupplierLocality[];
};

export type SupplierRow = {
  id: string;
  supplier_type: string;
  name: string;
  region: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  registry_number: string | null;
  star_rating: number | null;
  capacity: number | null;
  price_from: number | string | null;
  price_to: number | string | null;
  currency: string | null;
  price_unit: string | null;
  source_name: string | null;
  status: string | null;
  total_count: number | string;
};

export type SupplierListQuery = {
  supplierType?: string;
  region?: string;
  locality?: string;
  search?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: "location" | "name" | "price_asc" | "price_desc" | "stars_desc";
  limit?: number;
  offset?: number;
};

export async function loadSupplierStats() {
  const response = await authenticatedSupabaseFetch("rpc/admin_external_supplier_stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) throw new Error("Supplier statistikasi yuklanmadi");
  return response.json() as Promise<SupplierStats>;
}

export async function loadSupplierFilterOptions() {
  const response = await authenticatedSupabaseFetch("rpc/admin_external_supplier_filter_options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) throw new Error("Supplier filtr ro‘yxati yuklanmadi");
  return response.json() as Promise<SupplierFilterOptions>;
}

export async function loadSuppliers(query: SupplierListQuery = {}) {
  const response = await authenticatedSupabaseFetch("rpc/admin_list_external_suppliers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_supplier_type: query.supplierType || null,
      p_region: query.region || null,
      p_locality: query.locality || null,
      p_search: query.search || null,
      p_min_price: query.minPrice ? Number(query.minPrice) : null,
      p_max_price: query.maxPrice ? Number(query.maxPrice) : null,
      p_sort: query.sort || "location",
      p_limit: query.limit ?? 50,
      p_offset: query.offset ?? 0,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || "Supplierlar ro‘yxati yuklanmadi");
  }
  return response.json() as Promise<SupplierRow[]>;
}

export async function importSuppliers(items: SupplierImportItem[]) {
  const response = await authenticatedSupabaseFetch("rpc/admin_import_external_suppliers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_items: items }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || "Import bajarilmadi");
  }
  return response.json() as Promise<SupplierImportResult>;
}
