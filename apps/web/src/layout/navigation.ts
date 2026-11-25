import {
  Boxes,
  Calculator,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  Package,
  Printer,
  Receipt,
  Settings,
  Store,
  TrendingUp,
  Users,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** The build part that delivers this module; absent once it exists. */
  part?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/orders', label: 'Orders & Printing', icon: Printer, part: '7' },
  { to: '/inventory', label: 'Inventory', icon: Boxes },
  { to: '/expenses', label: 'Costs & Expenses', icon: Receipt },
  { to: '/products', label: 'Products & Services', icon: Package },
  { to: '/sales', label: 'Sales & Profit', icon: TrendingUp, part: '8' },
  { to: '/calculator', label: 'Calculator', icon: Calculator },
  { to: '/quotes', label: 'Quotes', icon: FileText },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/showcase', label: 'Showcase', icon: Store },
  { to: '/settings', label: 'Settings', icon: Settings },
];
