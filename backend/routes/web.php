<?php

use App\Http\Controllers\DashboardController;
use App\Http\Controllers\WorkspacePageController;
use Illuminate\Support\Facades\Route;

Route::get('/', [DashboardController::class, 'index'])->name('dashboard');

Route::get('/pesanan', [WorkspacePageController::class, 'orders'])->name('orders.index');
Route::get('/pengiriman', [WorkspacePageController::class, 'shipping'])->name('shipping.index');
Route::get('/transaksi', [WorkspacePageController::class, 'finance'])->name('finance.index');
Route::get('/toko', [WorkspacePageController::class, 'stores'])->name('stores.index');
Route::get('/import-keuangan', [WorkspacePageController::class, 'incomeImport'])->name('imports.income.index');
Route::get('/import-pengiriman', [WorkspacePageController::class, 'shipmentImport'])->name('imports.shipment.index');
Route::get('/promosi', [WorkspacePageController::class, 'promotions'])->name('promotions.index');
Route::get('/penentuan-harga', [WorkspacePageController::class, 'pricing'])->name('pricing.index');
Route::get('/produk', [WorkspacePageController::class, 'products'])->name('products.index');
Route::get('/produk-variant', [WorkspacePageController::class, 'variants'])->name('variants.index');
Route::get('/mapping-pesanan', [WorkspacePageController::class, 'mapping'])->name('mapping.index');

Route::post('/toko', [DashboardController::class, 'store'])->name('stores.store');
Route::post('/import-pengiriman', [DashboardController::class, 'importShipment'])->name('imports.shipment');
Route::post('/import-keuangan', [DashboardController::class, 'importIncome'])->name('imports.income');

// Compatibility aliases for existing forms and API consumers.
Route::post('/stores', [DashboardController::class, 'store']);
Route::post('/imports/shipment', [DashboardController::class, 'importShipment']);
Route::post('/imports/income', [DashboardController::class, 'importIncome']);
