<?php

namespace App\Http\Controllers;

use App\Models\Store;
use App\Models\User;
use App\Services\CommerceFileImporter;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\View\View;
use InvalidArgumentException;
use RuntimeException;

class DashboardController extends Controller
{
    public function index(Request $request): View
    {
        $stores = Store::query()->where('is_active', true)->orderBy('name')->get();
        $requestedStoreId = $request->integer('store_id');
        $selectedStore = $stores->firstWhere('id', $requestedStoreId) ?? $stores->first();

        return view('dashboard', [
            'stores' => $stores,
            'selectedStore' => $selectedStore,
            'summary' => $selectedStore ? $this->summary($selectedStore->id) : $this->emptySummary(),
            'orders' => $selectedStore ? $this->recentOrders($selectedStore->id) : collect(),
            'imports' => $selectedStore ? $this->recentImports($selectedStore->id) : collect(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'platform' => ['required', 'string', 'max:40'],
        ]);

        $user = User::query()->firstOrCreate(
            ['email' => 'owner@mp-tiktok.test'],
            ['name' => 'Workspace Owner', 'password' => Hash::make(Str::random(64))],
        );

        $baseSlug = Str::slug($validated['name']) ?: 'toko';
        $slug = $baseSlug;
        $suffix = 2;

        while (Store::query()->where('user_id', $user->id)->where('slug', $slug)->exists()) {
            $slug = $baseSlug.'-'.$suffix++;
        }

        $store = Store::create([
            'user_id' => $user->id,
            'name' => $validated['name'],
            'slug' => $slug,
            'platform' => $validated['platform'],
            'is_active' => true,
        ]);

        return redirect()->route('dashboard', ['store_id' => $store->id])
            ->with('success', 'Toko berhasil ditambahkan.');
    }

    public function importShipment(Request $request, CommerceFileImporter $importer): RedirectResponse
    {
        $validated = $request->validate([
            'store_id' => ['required', 'integer', 'exists:stores,id'],
            'shipment' => ['required', 'file', 'mimes:csv,txt', 'max:51200'],
        ]);

        $path = $this->temporaryUploadPath($request->file('shipment'), 'csv');

        try {
            return $this->runImport(
                $validated['store_id'],
                fn (int $storeId, string $path): array => $importer->importShipmentCsv($storeId, $path),
                $path,
                'Import shipment',
            );
        } finally {
            @unlink($path);
        }
    }

    public function importIncome(Request $request, CommerceFileImporter $importer): RedirectResponse
    {
        $validated = $request->validate([
            'store_id' => ['required', 'integer', 'exists:stores,id'],
            'income' => ['required', 'file', 'mimes:xlsx', 'max:51200'],
        ]);

        $path = $this->temporaryUploadPath($request->file('income'), 'xlsx');

        try {
            return $this->runImport(
                $validated['store_id'],
                fn (int $storeId, string $path): array => $importer->importIncomeXlsx($storeId, $path),
                $path,
                'Import keuangan',
            );
        } finally {
            @unlink($path);
        }
    }

    /** @param callable(int, string): array<string, int|string> $callback */
    private function runImport(int $storeId, callable $callback, string|false $path, string $label): RedirectResponse
    {
        if ($path === false) {
            return redirect()->route('dashboard', ['store_id' => $storeId])
                ->with('error', $label.' gagal: file tidak dapat dibaca.');
        }

        try {
            $result = $callback($storeId, $path);
            $status = $result['status'] ?? 'imported';
            $message = $status === 'already_imported'
                ? $label.' dilewati karena file yang sama sudah pernah diimpor.'
                : $label.' berhasil. '.($result['imported_count'] ?? 0).' baris disimpan.';

            return redirect()->route('dashboard', ['store_id' => $storeId])->with('success', $message);
        } catch (InvalidArgumentException|RuntimeException $exception) {
            return redirect()->route('dashboard', ['store_id' => $storeId])
                ->with('error', $label.' gagal: '.$exception->getMessage());
        }
    }

    private function temporaryUploadPath(UploadedFile $file, string $extension): string
    {
        $source = $file->getRealPath();
        $temporaryPath = tempnam(sys_get_temp_dir(), 'mp-tiktok-');

        if ($source === false || $temporaryPath === false) {
            throw new RuntimeException('File upload tidak dapat disiapkan.');
        }

        $path = $temporaryPath.'.'.$extension;
        @unlink($temporaryPath);

        if (! copy($source, $path)) {
            throw new RuntimeException('File upload tidak dapat disalin.');
        }

        return $path;
    }

    /** @return array<string, int|float> */
    private function summary(int $storeId): array
    {
        $orders = DB::table('orders')->where('store_id', $storeId)->first([
            DB::raw('COUNT(*) as total_orders'),
            DB::raw("SUM(CASE WHEN financial_status = 'credited_to_balance' THEN 1 ELSE 0 END) as credited_orders"),
            DB::raw("SUM(CASE WHEN financial_status = 'not_reported' THEN 1 ELSE 0 END) as pending_orders"),
            DB::raw('COALESCE(SUM(order_amount), 0) as gross_order_amount'),
        ]);
        $shipping = DB::table('order_packages as packages')
            ->join('orders', 'orders.id', '=', 'packages.order_id')
            ->where('orders.store_id', $storeId)
            ->first([
                DB::raw('COUNT(*) as package_count'),
                DB::raw('SUM(CASE WHEN packages.shipped_at IS NOT NULL THEN 1 ELSE 0 END) as shipped_packages'),
                DB::raw('SUM(CASE WHEN packages.delivered_at IS NOT NULL THEN 1 ELSE 0 END) as delivered_packages'),
            ]);
        $finance = DB::table('financial_transactions')->where('store_id', $storeId)->first([
            DB::raw('COUNT(*) as transaction_count'),
            DB::raw('COALESCE(SUM(settlement_amount), 0) as settlement_amount'),
            DB::raw('COALESCE(SUM(total_revenue), 0) as total_revenue'),
            DB::raw('COALESCE(SUM(total_fees), 0) as total_fees'),
        ]);

        return [
            'total_orders' => (int) ($orders->total_orders ?? 0),
            'credited_orders' => (int) ($orders->credited_orders ?? 0),
            'pending_orders' => (int) ($orders->pending_orders ?? 0),
            'gross_order_amount' => (int) ($orders->gross_order_amount ?? 0),
            'package_count' => (int) ($shipping->package_count ?? 0),
            'shipped_packages' => (int) ($shipping->shipped_packages ?? 0),
            'delivered_packages' => (int) ($shipping->delivered_packages ?? 0),
            'transaction_count' => (int) ($finance->transaction_count ?? 0),
            'settlement_amount' => (int) ($finance->settlement_amount ?? 0),
            'total_revenue' => (int) ($finance->total_revenue ?? 0),
            'total_fees' => (int) ($finance->total_fees ?? 0),
        ];
    }

    private function recentOrders(int $storeId): \Illuminate\Support\Collection
    {
        return DB::table('orders as orders')
            ->leftJoin('order_items as items', 'items.order_id', '=', 'orders.id')
            ->leftJoin('order_packages as packages', 'packages.id', '=', 'items.order_package_id')
            ->where('orders.store_id', $storeId)
            ->orderByDesc('orders.source_created_at')
            ->orderByDesc('orders.id')
            ->limit(20)
            ->get([
                'orders.external_order_id',
                'orders.source_order_status',
                'orders.financial_status',
                'orders.order_amount',
                'orders.source_created_at',
                'items.product_name',
                'items.variation',
                'items.quantity',
                'packages.tracking_id',
                'packages.delivered_at',
            ]);
    }

    private function recentImports(int $storeId): \Illuminate\Support\Collection
    {
        return DB::table('import_batches')
            ->where('store_id', $storeId)
            ->latest('imported_at')
            ->latest('id')
            ->limit(8)
            ->get();
    }

    /** @return array<string, int> */
    private function emptySummary(): array
    {
        return array_fill_keys([
            'total_orders', 'credited_orders', 'pending_orders', 'gross_order_amount',
            'package_count', 'shipped_packages', 'delivered_packages', 'transaction_count',
            'settlement_amount', 'total_revenue', 'total_fees',
        ], 0);
    }
}
