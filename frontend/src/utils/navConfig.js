import {
  LayoutDashboard,
  MonitorSmartphone,
  ClipboardList,
  Grid3x3,
  UtensilsCrossed,
  UserCog,
  Clock3,
  BarChart3,
  Settings,
} from 'lucide-react';

export const adminNavItems = [
  { label: 'Dashboard', to: '/admin', icon: LayoutDashboard, permission: 'reports.view', end: true },
  { label: 'POS', to: '/pos', icon: MonitorSmartphone, permission: 'pos.access' },
  { label: 'Orders', to: '/admin/orders', icon: ClipboardList, permission: 'orders.view' },
  { label: 'Tables', to: '/admin/tables', icon: Grid3x3, permission: 'tables.view' },
  { label: 'Menu Management', to: '/admin/menu', icon: UtensilsCrossed, permission: 'menu.view' },
  { label: 'Employees', to: '/admin/employees', icon: UserCog, permission: 'employees.manage' },
  { label: 'Shifts', to: '/admin/shifts', icon: Clock3, permission: 'shifts.manage' },
  { label: 'Reports', to: '/admin/reports', icon: BarChart3, permission: 'reports.view' },
  { label: 'Settings', to: '/admin/settings', icon: Settings, permission: 'settings.manage' },
];
