// ============================================
// Authentication & Authorization Types
// ============================================

export type UserRole = 'owner' | 'manager' | 'cashier' | 'waitron' | 'kitchen_staff' | 'bar_staff';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  pin?: string; // For quick POS login
  isActive: boolean;
  createdAt: string;
}

// Role-based permissions
export interface RolePermissions {
  // Dashboard & Reports
  viewDashboard: boolean;
  viewReports: boolean;
  viewManagementOverview: boolean;
  
  // Inventory
  viewInventory: boolean;
  manageInventory: boolean;
  performStockTake: boolean;
  createStockIssues: boolean;
  
  // Manufacturing
  viewRecipes: boolean;
  manageRecipes: boolean;
  recordBatchProduction: boolean;
  
  // Purchases
  viewPurchases: boolean;
  createGRV: boolean;
  confirmGRV: boolean;
  
  // Staff
  viewStaff: boolean;
  manageStaff: boolean;
  
  // POS
  accessPOS: boolean;
  createOrders: boolean;
  processPayments: boolean;
  applyDiscounts: boolean;
  voidItems: boolean;
  transferTables: boolean;
  
  // Cash Up
  viewOwnCashUp: boolean;
  viewAllCashUps: boolean;
  performCashUp: boolean;
  
  // Settings
  viewSettings: boolean;
  manageSettings: boolean;
}

// Default permissions by role
export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  owner: {
    viewDashboard: true,
    viewReports: true,
    viewManagementOverview: true,
    viewInventory: true,
    manageInventory: true,
    performStockTake: true,
    createStockIssues: true,
    viewRecipes: true,
    manageRecipes: true,
    recordBatchProduction: true,
    viewPurchases: true,
    createGRV: true,
    confirmGRV: true,
    viewStaff: true,
    manageStaff: true,
    accessPOS: true,
    createOrders: true,
    processPayments: true,
    applyDiscounts: true,
    voidItems: true,
    transferTables: true,
    viewOwnCashUp: true,
    viewAllCashUps: true,
    performCashUp: true,
    viewSettings: true,
    manageSettings: true,
  },
  manager: {
    viewDashboard: true,
    viewReports: true,
    viewManagementOverview: true,
    viewInventory: true,
    manageInventory: true,
    performStockTake: true,
    createStockIssues: true,
    viewRecipes: true,
    manageRecipes: true,
    recordBatchProduction: true,
    viewPurchases: true,
    createGRV: true,
    confirmGRV: true,
    viewStaff: true,
    manageStaff: false,
    accessPOS: true,
    createOrders: true,
    processPayments: true,
    applyDiscounts: true,
    voidItems: true,
    transferTables: true,
    viewOwnCashUp: true,
    viewAllCashUps: true,
    performCashUp: true,
    viewSettings: true,
    manageSettings: false,
  },
  cashier: {
    viewDashboard: false,
    viewReports: false,
    viewManagementOverview: false,
    viewInventory: false,
    manageInventory: false,
    performStockTake: false,
    createStockIssues: false,
    viewRecipes: false,
    manageRecipes: false,
    recordBatchProduction: false,
    viewPurchases: false,
    createGRV: false,
    confirmGRV: false,
    viewStaff: false,
    manageStaff: false,
    accessPOS: true,
    createOrders: true,
    processPayments: true,
    applyDiscounts: false,
    voidItems: false,
    transferTables: false,
    viewOwnCashUp: true,
    viewAllCashUps: false,
    performCashUp: true,
    viewSettings: false,
    manageSettings: false,
  },
  waitron: {
    viewDashboard: false,
    viewReports: false,
    viewManagementOverview: false,
    viewInventory: false,
    manageInventory: false,
    performStockTake: false,
    createStockIssues: false,
    viewRecipes: false,
    manageRecipes: false,
    recordBatchProduction: false,
    viewPurchases: false,
    createGRV: false,
    confirmGRV: false,
    viewStaff: false,
    manageStaff: false,
    accessPOS: true,
    createOrders: true,
    processPayments: true,
    applyDiscounts: false,
    voidItems: false,
    transferTables: true,
    viewOwnCashUp: true,
    viewAllCashUps: false,
    performCashUp: true,
    viewSettings: false,
    manageSettings: false,
  },
  kitchen_staff: {
    viewDashboard: false,
    viewReports: false,
    viewManagementOverview: false,
    viewInventory: true,
    manageInventory: false,
    performStockTake: false,
    createStockIssues: true,
    viewRecipes: true,
    manageRecipes: false,
    recordBatchProduction: true,
    viewPurchases: false,
    createGRV: false,
    confirmGRV: false,
    viewStaff: false,
    manageStaff: false,
    accessPOS: false,
    createOrders: false,
    processPayments: false,
    applyDiscounts: false,
    voidItems: false,
    transferTables: false,
    viewOwnCashUp: false,
    viewAllCashUps: false,
    performCashUp: false,
    viewSettings: false,
    manageSettings: false,
  },
  bar_staff: {
    viewDashboard: false,
    viewReports: false,
    viewManagementOverview: false,
    viewInventory: true,
    manageInventory: false,
    performStockTake: false,
    createStockIssues: true,
    viewRecipes: false,
    manageRecipes: false,
    recordBatchProduction: false,
    viewPurchases: false,
    createGRV: false,
    confirmGRV: false,
    viewStaff: false,
    manageStaff: false,
    accessPOS: true,
    createOrders: true,
    processPayments: true,
    applyDiscounts: false,
    voidItems: false,
    transferTables: false,
    viewOwnCashUp: true,
    viewAllCashUps: false,
    performCashUp: true,
    viewSettings: false,
    manageSettings: false,
  },
};

// Role display names
export const ROLE_NAMES: Record<UserRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  cashier: 'Cashier',
  waitron: 'Waitron',
  kitchen_staff: 'Kitchen Staff',
  bar_staff: 'Bar Staff',
};
