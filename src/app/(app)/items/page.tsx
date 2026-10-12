"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { isAdminRole, type Item } from "@/lib/types";
import { useViewerRole } from "@/lib/useViewerRole";
import Modal from "@/components/Modal";
import Card from "@/components/Card";
import ItemForm from "@/components/ItemForm";
import SearchInput from "@/components/SearchInput";
import StockAdjustModal from "@/components/StockAdjustModal";

export default function ItemsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const viewerRole = useViewerRole();
  const canDelete = viewerRole !== null && isAdminRole(viewerRole);

  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Item | undefined>(undefined);
  const [adjusting, setAdjusting] = useState<Item | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/items");
    setItems(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      openAdd();
      router.replace("/items");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function openAdd() {
    setEditing(undefined);
    setModalOpen(true);
  }
  function openEdit(item: Item) {
    setEditing(item);
    setModalOpen(true);
  }
  function handleSaved() {
    setModalOpen(false);
    load();
  }

  async function handleDelete(item: Item) {
    if (!confirm(`Delete "${item.name}"?`)) return;
    const res = await fetch(`/api/items/${item.id}`, { method: "DELETE" });
    if (res.ok) load();
    else {
      const data = await res.json();
      alert(data.error ?? "Could not delete item");
    }
  }

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Items</h1>
        <div className="flex flex-1 items-center justify-end gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search items…" />
          <button
            onClick={openAdd}
            className="shrink-0 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white"
          >
            + Add item
          </button>
        </div>
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-black/60 dark:text-white/60">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const low =
                  item.lowStockThreshold != null &&
                  item.currentStockQty <= item.lowStockThreshold;
                return (
                  <tr key={item.id} className="border-t border-black/5 dark:border-white/5">
                    <td className="px-4 py-3">{item.name}</td>
                    <td className="px-4 py-3">{item.unit}</td>
                    <td className={`px-4 py-3 text-right ${low ? "text-[#d03b3b] font-medium" : ""}`}>
                      <button
                        onClick={() => setAdjusting(item)}
                        title="Adjust stock"
                        className="underline decoration-dotted underline-offset-4 hover:text-brand"
                      >
                        {Number(item.currentStockQty.toFixed(3))} {item.unit}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => setAdjusting(item)}
                        className="mr-2 font-medium text-brand underline underline-offset-4"
                      >
                        Adjust stock
                      </button>
                      <button onClick={() => openEdit(item)} className="mr-2 underline underline-offset-4">
                        Edit
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(item)}
                          className="text-[#d03b3b] underline underline-offset-4"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-black/50 dark:text-white/50">
                    {items.length === 0 ? "No items yet." : "No items match your search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {adjusting && (
        <StockAdjustModal
          item={adjusting}
          canDelete={canDelete}
          onClose={() => setAdjusting(null)}
          onChanged={load}
        />
      )}

      {modalOpen && (
        <Modal title={editing ? "Edit item" : "Add item"} onClose={() => setModalOpen(false)}>
          <ItemForm initial={editing} onSaved={handleSaved} onCancel={() => setModalOpen(false)} />
        </Modal>
      )}
    </div>
  );
}
