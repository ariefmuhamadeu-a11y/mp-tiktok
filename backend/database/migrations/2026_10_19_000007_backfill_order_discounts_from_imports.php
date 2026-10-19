<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Backfill discount facts from the fields already imported from TikTok.
     *
     * The source export does not identify voucher, bundle, or campaign names.
     * Therefore these rows intentionally keep promotion_id empty and retain
     * the original source field for later reconciliation.
     */
    public function up(): void
    {
        DB::transaction(function (): void {
            $now = now();
            $existingKeys = $this->existingBackfillKeys();
            $rows = [];

            $items = DB::table('order_items as i')
                ->join('orders as o', 'o.id', '=', 'i.order_id')
                ->select([
                    'i.id as order_item_id',
                    'i.order_id',
                    'o.store_id',
                    'i.seller_discount',
                    'i.platform_discount',
                ])
                ->get();

            foreach ($items as $item) {
                $this->appendDiscount(
                    $rows,
                    $existingKeys,
                    $item->store_id,
                    $item->order_id,
                    $item->order_item_id,
                    null,
                    'seller',
                    'seller',
                    $item->seller_discount,
                    'SKU Seller Discount',
                    $now,
                );
                $this->appendDiscount(
                    $rows,
                    $existingKeys,
                    $item->store_id,
                    $item->order_id,
                    $item->order_item_id,
                    null,
                    'platform',
                    'platform',
                    $item->platform_discount,
                    'SKU Platform Discount',
                    $now,
                );
            }

            $orders = DB::table('orders')
                ->select([
                    'id as order_id',
                    'store_id',
                    'payment_platform_discount',
                ])
                ->get();

            foreach ($orders as $order) {
                $this->appendDiscount(
                    $rows,
                    $existingKeys,
                    $order->store_id,
                    $order->order_id,
                    null,
                    null,
                    'payment',
                    'payment',
                    $order->payment_platform_discount,
                    'Payment platform discount',
                    $now,
                );
            }

            $packages = DB::table('order_packages as p')
                ->join('orders as o', 'o.id', '=', 'p.order_id')
                ->select([
                    'p.id as order_package_id',
                    'p.order_id',
                    'o.store_id',
                    'p.shipping_fee_seller_discount',
                    'p.shipping_fee_platform_discount',
                ])
                ->get();

            foreach ($packages as $package) {
                $this->appendDiscount(
                    $rows,
                    $existingKeys,
                    $package->store_id,
                    $package->order_id,
                    null,
                    $package->order_package_id,
                    'shipping_seller',
                    'seller',
                    $package->shipping_fee_seller_discount,
                    'Shipping Fee Seller Discount',
                    $now,
                );
                $this->appendDiscount(
                    $rows,
                    $existingKeys,
                    $package->store_id,
                    $package->order_id,
                    null,
                    $package->order_package_id,
                    'shipping_platform',
                    'platform',
                    $package->shipping_fee_platform_discount,
                    'Shipping Fee Platform Discount',
                    $now,
                );
            }

            foreach (array_chunk($rows, 500) as $chunk) {
                DB::table('order_discounts')->insert($chunk);
            }

            $this->seedImportMappings($now);

            echo sprintf(
                "Backfilled %d order discount rows and import mappings.\n",
                count($rows),
            );
        });
    }

    /**
     * Backfill rows are immutable facts. The migration is safe to re-run
     * manually because the same source fact is not inserted twice.
     */
    public function down(): void
    {
        DB::table('order_discounts')->where('source', 'backfill')->delete();
        DB::table('promotion_import_mappings')
            ->where('source_name', 'tiktok_shipment')
            ->delete();
    }

    /**
     * @return array<string, true>
     */
    private function existingBackfillKeys(): array
    {
        return DB::table('order_discounts')
            ->where('source', 'backfill')
            ->get([
                'store_id',
                'order_id',
                'order_item_id',
                'promotion_id',
                'discount_type',
                'source_field',
            ])
            ->mapWithKeys(fn (object $row): array => [
                $this->discountKey(
                    $row->store_id,
                    $row->order_id,
                    $row->order_item_id,
                    $row->promotion_id,
                    $row->discount_type,
                    $row->source_field,
                ) => true,
            ])
            ->all();
    }

    /**
     * @param array<int, array<string, mixed>> $rows
     * @param array<string, true> $existingKeys
     */
    private function appendDiscount(
        array &$rows,
        array &$existingKeys,
        int $storeId,
        int $orderId,
        ?int $orderItemId,
        ?int $orderPackageId,
        string $discountType,
        string $fundedBy,
        mixed $amount,
        string $sourceField,
        mixed $now,
    ): void {
        $amount = (int) ($amount ?? 0);
        if ($amount <= 0) {
            return;
        }

        $key = $this->discountKey(
            $storeId,
            $orderId,
            $orderItemId,
            null,
            $discountType,
            $sourceField,
        );
        if (isset($existingKeys[$key])) {
            return;
        }

        $existingKeys[$key] = true;
        $rows[] = [
            'store_id' => $storeId,
            'order_id' => $orderId,
            'order_item_id' => $orderItemId,
            'promotion_id' => null,
            'promotion_name_raw' => null,
            'promotion_code_raw' => null,
            'discount_type' => $discountType,
            'funded_by' => $fundedBy,
            'amount' => $amount,
            'currency' => 'IDR',
            'source' => 'backfill',
            'source_field' => $sourceField,
            'source_row' => null,
            'metadata' => json_encode([
                'order_package_id' => $orderPackageId,
                'classification' => 'unidentified_import_discount',
            ], JSON_THROW_ON_ERROR),
            'created_at' => $now,
            'updated_at' => $now,
        ];
    }

    private function discountKey(
        int $storeId,
        int $orderId,
        ?int $orderItemId,
        ?int $promotionId,
        string $discountType,
        string $sourceField,
    ): string {
        return implode('|', [
            $storeId,
            $orderId,
            $orderItemId ?? 'order',
            $promotionId ?? 'unlinked',
            $discountType,
            $sourceField,
        ]);
    }

    private function seedImportMappings(mixed $now): void
    {
        $mappings = [
            ['SKU Seller Discount', 'seller'],
            ['SKU Platform Discount', 'platform'],
            ['Payment platform discount', 'payment'],
            ['Shipping Fee Seller Discount', 'shipping_seller'],
            ['Shipping Fee Platform Discount', 'shipping_platform'],
        ];

        foreach ($mappings as [$sourceField, $mappedType]) {
            $exists = DB::table('promotion_import_mappings')
                ->whereNull('store_id')
                ->where('source_name', 'tiktok_shipment')
                ->where('source_field', $sourceField)
                ->exists();

            if (!$exists) {
                DB::table('promotion_import_mappings')->insert([
                    'store_id' => null,
                    'source_name' => 'tiktok_shipment',
                    'source_field' => $sourceField,
                    'mapped_type' => $mappedType,
                    'is_active' => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }
};
