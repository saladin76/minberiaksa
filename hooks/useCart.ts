import { create } from 'zustand';

interface CartStore {
  items: any[];
  setItems: (items: any[]) => void;
  addItem: (item: any) => void;
  removeItem: (id: string) => void;
  clearItems: () => void;
}

export const useCart = create<CartStore>((set) => ({
  items: [],
  setItems: (items) => set({ items }),
  addItem: (item) => set((state) => ({ items: [...state.items, item] })),
  removeItem: (id) => set((state) => ({ 
    items: state.items.filter((item) => item.id !== id) 
  })),
  clearItems: () => set({ items: [] }),
})); 