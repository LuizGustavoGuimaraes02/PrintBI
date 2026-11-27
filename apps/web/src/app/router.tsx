import { createBrowserRouter, Navigate, Outlet, type RouteObject } from 'react-router';
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
const catalog = () => import('../features/catalog/pages');
const customers = () => import('../features/customers/pages');
const showcase = () => import('../features/showcase/pages');
const calculator = () => import('../features/calculator/pages');
const quotes = () => import('../features/quotes/pages');
const orders = () => import('../features/orders/pages');
const sales = () => import('../features/sales/pages');

const placeholders: RouteObject[] = NAV_ITEMS.filter((item) => item.part).map((item) => ({
  path: item.to.slice(1),
  element: <ModulePlaceholder title={item.label} part={item.part ?? ''} />,
}));

export const routes: RouteObject[] = [
  // Public showcase: no account, no session handling.
  { path: '/s/:companySlug', ...page(showcase, 'PublicShowcasePage') },
  { path: '/s/:companySlug/:productSlug', ...page(showcase, 'PublicProductPage') },
  { path: '/s/:companySlug/c/:collectionSlug', ...page(showcase, 'PublicCollectionPage') },
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
          // The admin's preview of a seasonal page, full screen like the public one.
          {
            path: '/showcase/collections/:key/preview',
            element: (
              <RequireCompany>
                <Outlet />
              </RequireCompany>
            ),
            children: [{ index: true, ...page(showcase, 'CollectionPreviewPage') }],
          },
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
              { path: 'products', ...page(catalog, 'ProductsPage') },
              { path: 'products/new', ...page(catalog, 'NewProductPage') },
              { path: 'products/:productId', ...page(catalog, 'ProductPage') },
              { path: 'showcase', ...page(settings, 'ShowcasePage') },
              { path: 'calculator', ...page(calculator, 'CalculatorPage') },
              { path: 'calculator/saved', ...page(calculator, 'SavedCalculationsPage') },
              { path: 'calculator/:calculationId', ...page(calculator, 'CalculatorPage') },
              { path: 'orders', ...page(orders, 'OrdersPage') },
              { path: 'orders/new', ...page(orders, 'OrderFormPage') },
              { path: 'orders/:orderId/edit', ...page(orders, 'OrderFormPage') },
              { path: 'sales', ...page(sales, 'SalesPage') },
              { path: 'sales/new', ...page(sales, 'SalePage') },
              { path: 'sales/:saleId', ...page(sales, 'SalePage') },
              { path: 'quotes', ...page(quotes, 'QuotesPage') },
              { path: 'quotes/new', ...page(quotes, 'QuoteEditorPage') },
              { path: 'quotes/:quoteId', ...page(quotes, 'QuoteEditorPage') },
              { path: 'customers', ...page(customers, 'CustomersPage') },
              { path: 'customers/:customerId', ...page(customers, 'CustomerPage') },
              {
                path: 'settings',
                ...page(settings, 'SettingsLayout'),
                children: [
                  { index: true, element: <Navigate to="business" replace /> },
                  { path: 'business', ...page(settings, 'BusinessPage') },
                  { path: 'team', ...page(settings, 'TeamPage') },
                  { path: 'showcase', element: <Navigate to="/showcase" replace /> },
                  { path: 'currency', ...page(settings, 'CurrencyPage') },
                  { path: 'calculator', ...page(settings, 'CalculatorDefaultsPage') },
                  { path: 'printers', ...page(settings, 'PrintersPage') },
                  { path: 'inventory', ...page(settings, 'InventorySettingsPage') },
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
