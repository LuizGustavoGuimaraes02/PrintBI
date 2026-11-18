import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { GuestOnly, RequireAccount, RequireCompany, SessionWatcher } from '../features/auth/guards';
import { ModulePlaceholder } from '../features/modules/ModulePlaceholder';
import { AppShell } from '../layout/AppShell';
import { NAV_ITEMS } from '../layout/navigation';

/** Loads a page's code only when its route is first visited. */
function page<K extends string>(
  load: () => Promise<Record<K, React.ComponentType>>,
  name: K,
): Pick<RouteObject, 'lazy'> {
  return { lazy: async () => ({ Component: (await load())[name] }) };
}

const auth = () => import('../features/auth/pages');
const settings = () => import('../features/settings/pages');
const inventory = () => import('../features/inventory/pages');
const expenses = () => import('../features/expenses/pages');

const placeholders: RouteObject[] = NAV_ITEMS.filter((item) => item.part).map((item) => ({
  path: item.to.slice(1),
  element: <ModulePlaceholder title={item.label} part={item.part ?? ''} />,
}));

export const routes: RouteObject[] = [
  {
    element: <SessionWatcher />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          { path: '/login', ...page(auth, 'LoginPage') },
          { path: '/register', ...page(auth, 'RegisterPage') },
          { path: '/forgot-password', ...page(auth, 'ForgotPasswordPage') },
        ],
      },
      { path: '/reset-password', ...page(auth, 'ResetPasswordPage') },
      { path: '/invite/:token', ...page(auth, 'InvitePage') },
      {
        element: <RequireAccount />,
        children: [
          { path: '/onboarding', ...page(auth, 'CreateCompanyPage') },
          {
            element: (
              <RequireCompany>
                <AppShell />
              </RequireCompany>
            ),
            children: [
              { index: true, ...page(() => import('../features/home/HomePage'), 'HomePage') },
              ...placeholders,
              { path: 'inventory', ...page(inventory, 'InventoryPage') },
              { path: 'inventory/new', ...page(inventory, 'NewItemPage') },
              { path: 'inventory/:itemId', ...page(inventory, 'ItemPage') },
              { path: 'expenses', ...page(expenses, 'ExpensesPage') },
              { path: 'expenses/new', ...page(expenses, 'NewExpensePage') },
              { path: 'expenses/:expenseId', ...page(expenses, 'ExpensePage') },
              {
                path: 'settings',
                ...page(settings, 'SettingsLayout'),
                children: [
                  { index: true, element: <Navigate to="business" replace /> },
                  { path: 'business', ...page(settings, 'BusinessPage') },
                  { path: 'team', ...page(settings, 'TeamPage') },
                  { path: 'currency', ...page(settings, 'CurrencyPage') },
                  { path: 'calculator', ...page(settings, 'CalculatorDefaultsPage') },
                  { path: 'printers', ...page(settings, 'PrintersPage') },
                  { path: 'categories', ...page(settings, 'CategoriesPage') },
                  { path: 'reminders', ...page(settings, 'RemindersPage') },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes);
