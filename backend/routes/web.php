<?php

use App\Http\Controllers\DashboardController;
use Illuminate\Support\Facades\Route;

Route::get('/', [DashboardController::class, 'index'])->name('dashboard');
Route::post('/stores', [DashboardController::class, 'store'])->name('stores.store');
Route::post('/imports/shipment', [DashboardController::class, 'importShipment'])->name('imports.shipment');
Route::post('/imports/income', [DashboardController::class, 'importIncome'])->name('imports.income');
