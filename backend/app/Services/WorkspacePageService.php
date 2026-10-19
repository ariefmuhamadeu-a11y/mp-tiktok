<?php

namespace App\Services;

use App\Models\Store;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class WorkspacePageService
{
    /** @return array{stores: Collection, selectedStore: ?Store, summary: array<string, int>, orders: Collection, imports: Collection} */
    public function context(?int $storeId = null): array
    {
        $stores = Store::query()->where('is_active', true)->orderBy('name')->get();
        $selectedStore = $stores->firstWhere('id', $storeId) ?? $stores->first();

        return [
            'stores' => $stores,
            'selectedStore' => $selectedStore,
            'summary' => $selectedStore ? $this->summary($selectedStore->id) : $this->emptySummary(),
            'orders' => $selectedStore ? $this->orders($selectedStore->id) : collect(),
            'imports' => $selectedStore ? $this->imports($selectedStore->id) : collect(),
        ];
    }

    public function packages(?int $storeId): Collection
    {
        if ($storeId === null) {
            return collect();
        }

        return DB::table('order_packages as packages')
            ->join('orders', 'orders.id', '=', 'packages.order_id')
            ->where('orders.store_id', $storeId)
            ->orderByDesc('packages.updated_at')
            ->orderByDesc('packages.id')
            ->limit(100)
            ->get([
                'orders.external_order_id',
                'orders.source_order_status',
                'packages.tracking_id',
                'packages.shipping_provider_name',
                'packages.shipped_at',
                'packages.delivered_at',
                'packages.delivery_option',
                'packages.recipient',
                'packages.regency_city',
            ]);
    }

    public function transactions(?int $storeId): Collection
    {
        if ($storeId === null) {
            return collect();
        }

        return DB::table('financial_transactions as transactions')
            ->leftJoin('orders', 'orders.id', '=', 'transactions.order_id')
            ->where('transactions.store_id', $storeId)
            ->orderByDesc(DB::raw('COALESCE(transactions.credited_on, transactions.ordered_on)'))
            ->orderByDesc('transactions.id')
            ->limit(100)
            ->get([
                'transactions.external_reference_id',
                'transactions.transaction_type',
                'transactions.ordered_on',
                'transactions.credited_on',
                'transactions.settlement_amount',
                'transactions.total_revenue',
                'transactions.total_fees',
                'orders.external_order_id',
                'orders.financial_status',
            ]);
    }

    public function orderCount(?int $storeId): int
    {
        return $storeId === null ? 0 : (int) DB::table('orders')->where('store_id', $storeId)->count();
    }

    /** @return array<string, int> */
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

    private function orders(int $storeId): Collection
    {
        return DB::table('orders as orders')
            ->leftJoin('order_items as items', 'items.order_id', '=', 'orders.id')
            ->leftJoin('order_packages as packages', 'packages.id', '=', 'items.order_package_id')
            ->where('orders.store_id', $storeId)
            ->orderByDesc('orders.source_created_at')
            ->orderByDesc('orders.id')
            ->limit(100)
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

    private function imports(int $storeId): Collection
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
