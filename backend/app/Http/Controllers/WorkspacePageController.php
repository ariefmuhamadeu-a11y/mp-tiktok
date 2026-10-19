<?php

namespace App\Http\Controllers;

use App\Services\WorkspacePageService;
use Illuminate\Http\Request;
use Illuminate\View\View;

class WorkspacePageController extends Controller
{
    public function __construct(private readonly WorkspacePageService $workspace) {}

    public function orders(Request $request): View
    {
        return view('pages.orders', $this->workspace->context($request->integer('store_id')));
    }

    public function shipping(Request $request): View
    {
        $context = $this->workspace->context($request->integer('store_id'));
        $context['packages'] = $this->workspace->packages($context['selectedStore']?->id);

        return view('pages.shipping', $context);
    }

    public function finance(Request $request): View
    {
        $context = $this->workspace->context($request->integer('store_id'));
        $context['transactions'] = $this->workspace->transactions($context['selectedStore']?->id);

        return view('pages.finance', $context);
    }

    public function stores(Request $request): View
    {
        return view('pages.stores', $this->workspace->context($request->integer('store_id')));
    }

    public function incomeImport(Request $request): View
    {
        return view('pages.imports.income', $this->workspace->context($request->integer('store_id')));
    }

    public function shipmentImport(Request $request): View
    {
        return view('pages.imports.shipment', $this->workspace->context($request->integer('store_id')));
    }

    public function module(string $module): View
    {
        $modules = [
            'promotions' => ['title' => 'Promosi', 'description' => 'Kelola voucher, bundle, dan campaign penjualan.'],
            'pricing' => ['title' => 'Penentuan Harga', 'description' => 'Tentukan harga jual, biaya marketplace, profit, dan target ROAS.'],
            'products' => ['title' => 'Produk', 'description' => 'Master produk internal dan relasi ke variant.'],
            'variants' => ['title' => 'Produk Variant', 'description' => 'Kelola SKU internal, barcode, dan atribut variant.'],
            'mapping' => ['title' => 'Mapping Pesanan Marketplace', 'description' => 'Hubungkan SKU marketplace ke produk dan variant internal.'],
        ];

        abort_unless(isset($modules[$module]), 404);

        return view('pages.module-placeholder', [
            'module' => $modules[$module],
            'pageKey' => $module,
        ]);
    }

    public function promotions(): View
    {
        return $this->module('promotions');
    }

    public function pricing(): View
    {
        return $this->module('pricing');
    }

    public function products(): View
    {
        return $this->module('products');
    }

    public function variants(): View
    {
        return $this->module('variants');
    }

    public function mapping(): View
    {
        return $this->module('mapping');
    }
}
