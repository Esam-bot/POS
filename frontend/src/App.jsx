import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminLayout from './layouts/AdminLayout';
import POSLayout from './layouts/POSLayout';
import LoginPage from './pages/auth/LoginPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import POSPage from './pages/pos/POSPage';
import POSTablesPage from './pages/pos/POSTablesPage';
import SessionDetailPage from './pages/pos/SessionDetailPage';
import POSOrdersPage from './pages/pos/POSOrdersPage';
import OrderDetailPage from './pages/pos/OrderDetailPage';
import PaymentPage from './pages/pos/PaymentPage';
import ReceiptPage from './pages/pos/ReceiptPage';
import OrderPrintPage from './pages/pos/OrderPrintPage';
import OrdersPage from './pages/orders/OrdersPage';
import TablesPage from './pages/tables/TablesPage';
import MenuLayout from './pages/menu/MenuLayout';
import MenuOverviewPage from './pages/menu/MenuOverviewPage';
import CategoriesPage from './pages/menu/CategoriesPage';
import ItemsPage from './pages/menu/ItemsPage';
import ModifiersPage from './pages/menu/ModifiersPage';
import StationsPage from './pages/menu/StationsPage';
import InventoryLayout from './pages/inventory/InventoryLayout';
import InventoryDashboardPage from './pages/inventory/InventoryDashboardPage';
import InventoryItemsPage from './pages/inventory/InventoryItemsPage';
import InventoryCategoriesPage from './pages/inventory/InventoryCategoriesPage';
import InventoryStockPage from './pages/inventory/InventoryStockPage';
import InventoryHistoryPage from './pages/inventory/InventoryHistoryPage';
import InventoryRecipesPage from './pages/inventory/InventoryRecipesPage';
import SuppliersPage from './pages/suppliers/SuppliersPage';
import PurchasesPage from './pages/purchases/PurchasesPage';
import CustomersPage from './pages/customers/CustomersPage';
import EmployeesPage from './pages/employees/EmployeesPage';
import ShiftsPage from './pages/shifts/ShiftsPage';
import ExpensesPage from './pages/expenses/ExpensesPage';
import ReportsPage from './pages/reports/ReportsPage';
import SettingsPage from './pages/settings/SettingsPage';
import { ToastProvider } from './components/ui/Toast';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="tables" element={<TablesPage />} />
            <Route path="menu" element={<MenuLayout />}>
              <Route index element={<MenuOverviewPage />} />
              <Route path="categories" element={<CategoriesPage />} />
              <Route path="items" element={<ItemsPage />} />
              <Route path="modifiers" element={<ModifiersPage />} />
              <Route path="stations" element={<StationsPage />} />
            </Route>
            <Route path="inventory" element={<InventoryLayout />}>
              <Route index element={<InventoryDashboardPage />} />
              <Route path="items" element={<InventoryItemsPage />} />
              <Route path="categories" element={<InventoryCategoriesPage />} />
              <Route path="stock" element={<InventoryStockPage />} />
              <Route path="history" element={<InventoryHistoryPage />} />
              <Route path="recipes" element={<InventoryRecipesPage />} />
            </Route>
            <Route path="suppliers" element={<SuppliersPage />} />
            <Route path="purchases" element={<PurchasesPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="employees" element={<EmployeesPage />} />
            <Route path="shifts" element={<ShiftsPage />} />
            <Route path="expenses" element={<ExpensesPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          <Route element={<ProtectedRoute permission="pos.access" />}>
            <Route path="/pos" element={<POSLayout />}>
              <Route index element={<POSPage />} />
              <Route path="tables" element={<POSTablesPage />} />
              <Route path="sessions/:id" element={<SessionDetailPage />} />
              <Route path="orders" element={<POSOrdersPage />} />
              <Route path="orders/:id" element={<OrderDetailPage />} />
              <Route path="orders/:id/pay" element={<PaymentPage />} />
              <Route path="orders/:id/print" element={<OrderPrintPage />} />
              <Route path="orders/:id/receipt" element={<ReceiptPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
