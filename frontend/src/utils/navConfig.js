import {
  LayoutDashboard,
  ShoppingCart,
  ClipboardList,
  Utensils,
  Table2,
  Package,
  ChartNoAxesCombined,
  Settings,
  ChefHat,
} from 'lucide-react';

export const adminNavItems = [
  { label: 'Dashboard', to: '/admin', icon: LayoutDashboard, permission: 'reports.view', end: true },
  { label: 'POS', to: '/pos', icon: ShoppingCart, permission: 'pos.access' },
  { label: 'Kitchen', to: '/kitchen', icon: ChefHat, permission: 'kitchen.view' },
  { label: 'Orders', to: '/admin/orders', icon: ClipboardList, permission: 'orders.view' },
  { label: 'Tables', to: '/admin/tables', icon: Table2, permission: 'tables.view' },
  { label: 'Menu Management', to: '/admin/menu', icon: Utensils, permission: 'menu.view' },
  { label: 'Inventory', to: '/admin/inventory', icon: Package, permission: 'inventory.view' },
  { label: 'Reports', to: '/admin/reports', icon: ChartNoAxesCombined, permission: 'reports.view' },
  { label: 'Settings', to: '/admin/settings', icon: Settings, permission: 'settings.manage' },
];
