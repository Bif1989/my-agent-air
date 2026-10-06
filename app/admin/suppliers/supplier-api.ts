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

export async function loadSupplierStats() {
  const response = await authenticatedSupabaseFetch("rpc/admin_external_supplier_stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) throw new Error("Supplier statistikasi yuklanmadi");
  return response.json() as Promise<SupplierStats>;
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
