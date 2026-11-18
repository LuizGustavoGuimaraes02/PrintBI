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
  { to: '/products', label: 'Products & Services', icon: Package, part: '4' },
  { to: '/sales', label: 'Sales & Profit', icon: TrendingUp, part: '8' },
  { to: '/calculator', label: 'Calculator', icon: Calculator, part: '5' },
  { to: '/quotes', label: 'Quotes', icon: FileText, part: '6' },
  { to: '/customers', label: 'Customers', icon: Users, part: '4' },
  { to: '/showcase', label: 'Showcase', icon: Store, part: '4b' },
  { to: '/settings', label: 'Settings', icon: Settings },
];
