<?php

namespace App\Services;

use DateTimeImmutable;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use RuntimeException;

class CommerceFileImporter
{
    public function __construct(private XlsxWorkbookReader $workbookReader) {}

    /** @return array<string, int|string> */
    public function importShipmentCsv(int $storeId, string $path): array
    {
        $this->assertReadableFile($path, 'csv');

        return DB::transaction(function () use ($storeId, $path): array {
            $batch = $this->startBatch($storeId, 'shipment', $path);

            if ($batch === null) {
                $this->syncFinancialStatuses($storeId);

                return ['status' => 'already_imported'];
            }

            $handle = fopen($path, 'rb');

            if ($handle === false) {
                throw new RuntimeException('CSV tidak dapat dibuka.');
            }

            try {
                $header = fgetcsv($handle);

                if ($header === false) {
                    throw new InvalidArgumentException('CSV kosong.');
                }

                $header = array_map(static fn (string $name): string => trim(preg_replace('/^\xEF\xBB\xBF/', '', $name)), $header);
                $this->requireHeaders($header, ['Order ID', 'SKU ID', 'Package ID']);
                $counts = $this->emptyCounts();
                $seenRows = [];
                $lineOccurrences = [];
                $rowNumber = 1;

                while (($values = fgetcsv($handle)) !== false) {
                    $rowNumber++;

                    if (count($values) === 1 && trim((string) $values[0]) === '') {
                        continue;
                    }

                    if (count($values) !== count($header)) {
                        throw new InvalidArgumentException("CSV baris {$rowNumber} memiliki jumlah kolom yang berbeda.");
                    }

                    $row = array_combine($header, $values);
                    $rowHash = $this->contentHash($row);
                    $counts['row_count']++;

                    if (isset($seenRows[$rowHash])) {
                        $counts['duplicate_count']++;
                        $this->saveImportRow($batch, 'CSV', $rowNumber, $row, $rowHash, 'duplicate');

                        continue;
                    }

                    $seenRows[$rowHash] = true;
                    $orderExternalId = $this->value($row, 'Order ID');

                    if ($orderExternalId === null) {
                        throw new InvalidArgumentException("Order ID kosong pada baris {$rowNumber}.");
                    }

                    $orderId = $this->upsertOrder($storeId, $orderExternalId, $row);
                    $packageId = $this->upsertPackage($orderId, $row);
                    $itemId = $this->upsertItem($orderId, $packageId, $row, $lineOccurrences);
                    $this->saveImportRow($batch, 'CSV', $rowNumber, $row, $rowHash, 'imported', $orderId, $itemId);
                    $counts['imported_count']++;

                    DB::table('financial_transactions')
                        ->where('store_id', $storeId)
                        ->where('external_reference_id', $orderExternalId)
                        ->where('transaction_type', 'Pesanan')
                        ->whereNull('order_id')
                        ->update(['order_id' => $orderId, 'updated_at' => now()]);
                }

                $this->finishBatch($batch, $counts);
                $this->syncFinancialStatuses($storeId);

                return ['status' => 'imported'] + $counts;
            } finally {
                fclose($handle);
            }
        });
    }

    /** @return array<string, int|string> */
    public function importIncomeXlsx(int $storeId, string $path): array
    {
        $this->assertReadableFile($path, 'xlsx');
        $details = $this->workbookReader->readSheet($path, 'Detail pesanan');
        $report = $this->workbookReader->readSheet($path, 'Laporan');
        $withdrawals = $this->workbookReader->readSheet($path, 'Riwayat penarikan');

        return DB::transaction(function () use ($storeId, $path, $details, $report, $withdrawals): array {
            $batch = $this->startBatch($storeId, 'income', $path);

            if ($batch === null) {
                $this->syncFinancialStatuses($storeId);

                return ['status' => 'already_imported'];
            }

            if ($details === []) {
                throw new InvalidArgumentException('Sheet Detail pesanan kosong.');
            }

            $headers = $details[0]['cells'];
            $this->requireHeaders(array_values($headers), [
                'ID Pesanan/Penyesuaian', 'Jenis transaksi', 'Waktu pembayaran pesanan', 'Jumlah penyelesaian pembayaran',
            ]);
            $counts = $this->emptyCounts();
            $detailSettlementSum = 0;

            foreach (array_slice($details, 1) as $source) {
                $row = $this->combineCells($headers, $source['cells']);

                if ($this->allBlank($row)) {
                    continue;
                }

                $counts['row_count']++;
                $referenceId = $this->value($row, 'ID Pesanan/Penyesuaian');
                $transactionType = $this->value($row, 'Jenis transaksi');

                if ($referenceId === null || $transactionType === null) {
                    throw new InvalidArgumentException("ID atau jenis transaksi kosong pada baris {$source['row_number']}.");
                }

                $creditedOn = $this->sourceDate($this->value($row, 'Waktu pembayaran pesanan'));
                $eventKey = hash('sha256', implode('|', [$transactionType, $referenceId, $creditedOn ?? '']));
                $contentHash = $this->contentHash($row);
                $existing = DB::table('financial_transactions')
                    ->where('store_id', $storeId)
                    ->where('event_key', $eventKey)
                    ->first();

                if ($existing !== null) {
                    $sameContent = $existing->content_hash === $contentHash;
                    $counts[$sameContent ? 'duplicate_count' : 'error_count']++;
                    $this->saveImportRow(
                        $batch, 'Detail pesanan', $source['row_number'], $row, $contentHash,
                        $sameContent ? 'duplicate' : 'conflict', null, null, $existing->id,
                        null,
                        $sameContent ? null : 'Transaksi yang sama memiliki nilai berbeda; perlu ditinjau.',
                    );

                    continue;
                }

                $orderId = $transactionType === 'Pesanan'
                    ? DB::table('orders')->where('store_id', $storeId)->where('external_order_id', $referenceId)->value('id')
                    : null;
                $settlementAmount = $this->money($this->value($row, 'Jumlah penyelesaian pembayaran'));

                if ($settlementAmount === null) {
                    throw new InvalidArgumentException("Jumlah penyelesaian kosong pada baris {$source['row_number']}.");
                }

                $transactionId = DB::table('financial_transactions')->insertGetId([
                    'store_id' => $storeId,
                    'order_id' => $orderId,
                    'event_key' => $eventKey,
                    'content_hash' => $contentHash,
                    'external_reference_id' => $referenceId,
                    'transaction_type' => $transactionType,
                    'ordered_on' => $this->sourceDate($this->value($row, 'Waktu pemesanan')),
                    'credited_on' => $creditedOn,
                    'currency' => $this->value($row, 'Mata uang') ?? 'IDR',
                    'settlement_amount' => $settlementAmount,
                    'total_revenue' => $this->money($this->value($row, 'Total Pendapatan')),
                    'total_fees' => $this->money($this->value($row, 'Total Biaya')),
                    'refund_after_discount' => $this->money($this->value($row, 'Total pengembalian dana setelah diskon')),
                    'platform_commission' => $this->money($this->value($row, 'Biaya komisi platform')),
                    'logistics_service_fee' => $this->money($this->value($row, 'Biaya layanan logistik')),
                    'shipping_fee' => $this->money($this->value($row, 'Ongkir')),
                    'seller_discount' => $this->money($this->value($row, 'Diskon penjual')),
                    'breakdown' => $this->json($row),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                $this->saveImportRow(
                    $batch, 'Detail pesanan', $source['row_number'], $row, $contentHash,
                    $orderId === null && $transactionType === 'Pesanan' ? 'unmatched' : 'imported',
                    $orderId, null, $transactionId,
                );
                $detailSettlementSum += $settlementAmount;
                $counts['imported_count']++;

                if ($orderId === null && $transactionType === 'Pesanan') {
                    $counts['unmatched_count']++;
                }
            }

            if ($withdrawals !== []) {
                $withdrawalHeaders = $withdrawals[0]['cells'];

                foreach (array_slice($withdrawals, 1) as $source) {
                    $row = $this->combineCells($withdrawalHeaders, $source['cells']);

                    if ($this->allBlank($row)) {
                        continue;
                    }

                    $counts['row_count']++;
                    $referenceId = $this->value($row, 'ID referensi');
                    $transferType = $this->value($row, 'Jenis transaksi');

                    if ($referenceId === null || $transferType === null) {
                        throw new InvalidArgumentException("Referensi atau jenis transfer kosong pada baris {$source['row_number']}.");
                    }

                    $completedOn = $this->sourceDate($this->value($row, 'Waktu keberhasilan'));
                    $eventKey = hash('sha256', implode('|', [$transferType, $referenceId, $completedOn ?? '']));
                    $contentHash = $this->contentHash($row);
                    $existing = DB::table('financial_transfers')
                        ->where('store_id', $storeId)
                        ->where('event_key', $eventKey)
                        ->first();

                    if ($existing !== null) {
                        $sameContent = $existing->content_hash === $contentHash;
                        $counts[$sameContent ? 'duplicate_count' : 'error_count']++;
                        $this->saveImportRow(
                            $batch, 'Riwayat penarikan', $source['row_number'], $row, $contentHash,
                            $sameContent ? 'duplicate' : 'conflict', null, null,
                            $existing->financial_transaction_id, $existing->id,
                            $sameContent ? null : 'Transfer yang sama memiliki nilai berbeda; perlu ditinjau.',
                        );

                        continue;
                    }

                    $amount = $this->money($this->value($row, 'Total'));

                    if ($amount === null) {
                        throw new InvalidArgumentException("Total transfer kosong pada baris {$source['row_number']}.");
                    }

                    $financialId = DB::table('financial_transactions')
                        ->where('store_id', $storeId)
                        ->where('external_reference_id', $referenceId)
                        ->value('id');
                    $bankAccount = $this->value($row, 'Rekening bank');
                    $transferId = DB::table('financial_transfers')->insertGetId([
                        'store_id' => $storeId,
                        'financial_transaction_id' => $financialId,
                        'event_key' => $eventKey,
                        'content_hash' => $contentHash,
                        'external_reference_id' => $referenceId,
                        'transfer_type' => $transferType,
                        'requested_on' => $this->sourceDate($this->value($row, 'Waktu permintaan')),
                        'completed_on' => $completedOn,
                        'amount' => $amount,
                        'status' => $this->value($row, 'Status'),
                        'bank_account' => $bankAccount === '/' ? null : $bankAccount,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);

                    $this->saveImportRow(
                        $batch, 'Riwayat penarikan', $source['row_number'], $row, $contentHash,
                        'imported', null, null, $financialId, $transferId,
                    );
                    $counts['imported_count']++;
                }
            }

            $summary = $this->reportSummary($report);
            $reportedAmount = $this->money($summary['Jumlah penyelesaian pembayaran'] ?? null);
            $warning = $reportedAmount !== null && $reportedAmount !== $detailSettlementSum
                ? 'Total Laporan tidak sama dengan jumlah baris Detail pesanan; ringkasan tidak dipakai untuk status order.'
                : null;
            $this->finishBatch($batch, $counts, $summary, $warning);
            $this->syncFinancialStatuses($storeId);

            return ['status' => 'imported'] + $counts + ['warning' => $warning ?? ''];
        });
    }

    private function syncFinancialStatuses(int $storeId): void
    {
        $transactionsByOrder = DB::table('financial_transactions')
            ->where('store_id', $storeId)
            ->where('transaction_type', 'Pesanan')
            ->whereNotNull('order_id')
            ->get(['order_id', 'settlement_amount', 'refund_after_discount', 'credited_on'])
            ->groupBy('order_id');

        foreach (DB::table('orders')->where('store_id', $storeId)->get(['id', 'financial_status', 'balance_credited_on']) as $order) {
            $transactions = $transactionsByOrder->get($order->id);
            $status = 'not_reported';
            $creditedOn = null;

            if ($transactions !== null) {
                $net = (int) $transactions->sum('settlement_amount');
                $refunded = (int) $transactions->sum('refund_after_discount') < 0;
                $creditedOn = $transactions
                    ->filter(static fn ($transaction): bool => $transaction->settlement_amount > 0)
                    ->max('credited_on');

                $status = match (true) {
                    $net > 0 && $refunded => 'partially_refunded',
                    $net > 0 => 'credited_to_balance',
                    $refunded => 'refunded',
                    $net < 0 => 'negative_adjustment',
                    default => 'zero_settlement',
                };
            }

            if ($order->financial_status !== $status || $order->balance_credited_on !== $creditedOn) {
                DB::table('orders')->where('id', $order->id)->update([
                    'financial_status' => $status,
                    'balance_credited_on' => $creditedOn,
                    'updated_at' => now(),
                ]);
            }
        }
    }

    private function assertReadableFile(string $path, string $extension): void
    {
        if (! is_file($path) || ! is_readable($path) || strtolower(pathinfo($path, PATHINFO_EXTENSION)) !== $extension) {
            throw new InvalidArgumentException("File .{$extension} tidak ditemukan atau tidak dapat dibaca.");
        }
    }

    private function startBatch(int $storeId, string $kind, string $path): ?int
    {
        if (! DB::table('stores')->where('id', $storeId)->exists()) {
            throw new InvalidArgumentException('Toko tidak ditemukan.');
        }

        $hash = hash_file('sha256', $path);

        if ($hash === false) {
            throw new RuntimeException('Hash file tidak dapat dihitung.');
        }

        if (DB::table('import_batches')->where('store_id', $storeId)->where('kind', $kind)->where('file_sha256', $hash)->exists()) {
            return null;
        }

        return DB::table('import_batches')->insertGetId([
            'store_id' => $storeId,
            'kind' => $kind,
            'filename' => basename($path),
            'file_sha256' => $hash,
            'status' => 'processing',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /** @return array{row_count: int, imported_count: int, duplicate_count: int, unmatched_count: int, error_count: int} */
    private function emptyCounts(): array
    {
        return ['row_count' => 0, 'imported_count' => 0, 'duplicate_count' => 0, 'unmatched_count' => 0, 'error_count' => 0];
    }

    /** @param array<string, int> $counts */
    private function finishBatch(int $batchId, array $counts, ?array $summary = null, ?string $warning = null): void
    {
        DB::table('import_batches')->where('id', $batchId)->update($counts + [
            'status' => $counts['error_count'] > 0 ? 'needs_review' : 'completed',
            'report_summary' => $summary === null ? null : $this->json($summary),
            'warning' => $warning,
            'imported_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /** @param array<int, string> $headers */
    private function requireHeaders(array $headers, array $required): void
    {
        foreach ($required as $name) {
            if (! in_array($name, $headers, true)) {
                throw new InvalidArgumentException("Kolom {$name} tidak ditemukan.");
            }
        }
    }

    /** @param array<int, string> $headers @param array<int, string> $cells @return array<string, string> */
    private function combineCells(array $headers, array $cells): array
    {
        $row = [];

        foreach ($headers as $index => $header) {
            if (trim($header) !== '') {
                $row[trim($header)] = $cells[$index] ?? '';
            }
        }

        return $row;
    }

    /** @param array<string, string> $row */
    private function allBlank(array $row): bool
    {
        return count(array_filter($row, static fn (string $value): bool => trim($value) !== '')) === 0;
    }

    /** @param array<string, string> $row */
    private function value(array $row, string $key): ?string
    {
        $value = preg_replace('/\s+/u', ' ', trim($row[$key] ?? ''));

        return $value === '' ? null : $value;
    }

    private function money(?string $value): ?int
    {
        if ($value === null) {
            return null;
        }

        if (preg_match('/^-?\d+(?:\.0{1,2})?$/', $value) !== 1) {
            throw new InvalidArgumentException("Nominal tidak valid: {$value}");
        }

        return (int) $value;
    }

    private function quantity(?string $value): ?int
    {
        if ($value === null) {
            return null;
        }

        if (preg_match('/^\d+$/', $value) !== 1) {
            throw new InvalidArgumentException("Kuantitas tidak valid: {$value}");
        }

        return (int) $value;
    }

    private function sourceDate(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $date = DateTimeImmutable::createFromFormat('!Y/m/d', $value);

        if ($date === false || $date->format('Y/m/d') !== $value) {
            throw new InvalidArgumentException("Tanggal tidak valid: {$value}");
        }

        return $date->format('Y-m-d');
    }

    private function sourceDateTime(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $date = DateTimeImmutable::createFromFormat('!d/m/Y H:i:s', $value);

        if ($date === false || $date->format('d/m/Y H:i:s') !== $value) {
            throw new InvalidArgumentException("Waktu tidak valid: {$value}");
        }

        return $date->format('Y-m-d H:i:s');
    }

    /** @param array<string, string> $row */
    private function contentHash(array $row): string
    {
        return hash('sha256', $this->json($row));
    }

    private function json(array $value): string
    {
        return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    /** @param array<string, string> $row */
    private function upsertOrder(int $storeId, string $externalId, array $row): int
    {
        $values = [
            'source_order_status' => $this->value($row, 'Order Status'),
            'source_order_substatus' => $this->value($row, 'Order Substatus'),
            'cancellation_return_type' => $this->value($row, 'Cancelation/Return Type'),
            'order_type' => $this->value($row, 'Normal or Pre-order'),
            'order_refund_amount' => $this->money($this->value($row, 'Order Refund Amount')),
            'payment_platform_discount' => $this->money($this->value($row, 'Payment platform discount')),
            'buyer_service_fee' => $this->money($this->value($row, 'Buyer Service Fee')),
            'handling_fee' => $this->money($this->value($row, 'Handling Fee')),
            'order_amount' => $this->money($this->value($row, 'Order Amount')),
            'source_created_at' => $this->sourceDateTime($this->value($row, 'Created Time')),
            'source_paid_at' => $this->sourceDateTime($this->value($row, 'Paid Time')),
            'source_cancelled_at' => $this->sourceDateTime($this->value($row, 'Cancelled Time')),
            'cancel_by' => $this->value($row, 'Cancel By'),
            'cancel_reason' => $this->value($row, 'Cancel Reason'),
            'buyer_message' => $this->value($row, 'Buyer Message'),
            'buyer_username' => $this->value($row, 'Buyer Username'),
            'payment_method' => $this->value($row, 'Payment Method'),
            'purchase_channel' => $this->value($row, 'Purchase Channel'),
            'seller_note' => $this->value($row, 'Seller Note'),
            'checked_status' => $this->value($row, 'Checked Status'),
            'checked_marked_by' => $this->value($row, 'Checked Marked by'),
            'tokopedia_invoice_number' => $this->value($row, 'Tokopedia Invoice Number'),
            'order_channel' => $this->value($row, 'Order Channel'),
            'creator_handle' => $this->value($row, 'Creator Handle'),
            'updated_at' => now(),
        ];
        $query = DB::table('orders')->where('store_id', $storeId)->where('external_order_id', $externalId);
        $orderId = $query->value('id');

        if ($orderId !== null) {
            $query->update($values);

            return $orderId;
        }

        return DB::table('orders')->insertGetId($values + [
            'store_id' => $storeId,
            'external_order_id' => $externalId,
            'created_at' => now(),
        ]);
    }

    /** @param array<string, string> $row */
    private function upsertPackage(int $orderId, array $row): int
    {
        $externalId = $this->value($row, 'Package ID');
        $trackingId = $this->value($row, 'Tracking ID');
        $packageKey = $externalId ?? $trackingId;

        if ($packageKey === null) {
            throw new InvalidArgumentException('Package ID dan Tracking ID sama-sama kosong.');
        }

        $values = [
            'external_package_id' => $externalId,
            'tracking_id' => $trackingId,
            'delivery_option' => $this->value($row, 'Delivery Option'),
            'shipping_provider_name' => $this->value($row, 'Shipping Provider Name'),
            'fulfillment_type' => $this->value($row, 'Fulfillment Type'),
            'warehouse_name' => $this->value($row, 'Warehouse Name'),
            'rts_at' => $this->sourceDateTime($this->value($row, 'RTS Time')),
            'shipped_at' => $this->sourceDateTime($this->value($row, 'Shipped Time')),
            'delivered_at' => $this->sourceDateTime($this->value($row, 'Delivered Time')),
            'shipping_fee_after_discount' => $this->money($this->value($row, 'Shipping Fee After Discount')),
            'original_shipping_fee' => $this->money($this->value($row, 'Original Shipping Fee')),
            'shipping_fee_seller_discount' => $this->money($this->value($row, 'Shipping Fee Seller Discount')),
            'shipping_fee_platform_discount' => $this->money($this->value($row, 'Shipping Fee Platform Discount')),
            'distance_shipping_fee' => $this->money($this->value($row, 'Distance Shipping Fee')),
            'distance_fee' => $this->money($this->value($row, 'Distance Fee')),
            'shipping_insurance' => $this->money($this->value($row, 'Shipping Insurance')),
            'recipient' => $this->value($row, 'Recipient'),
            'phone' => $this->value($row, 'Phone #'),
            'zipcode' => $this->value($row, 'Zipcode'),
            'country' => $this->value($row, 'Country'),
            'province' => $this->value($row, 'Province'),
            'regency_city' => $this->value($row, 'Regency and City'),
            'districts' => $this->value($row, 'Districts'),
            'villages' => $this->value($row, 'Villages'),
            'detail_address' => $this->value($row, 'Detail Address'),
            'additional_address_information' => $this->value($row, 'Additional address information'),
            'updated_at' => now(),
        ];
        $query = DB::table('order_packages')->where('order_id', $orderId)->where('package_key', $packageKey);
        $packageId = $query->value('id');

        if ($packageId !== null) {
            $query->update($values);

            return $packageId;
        }

        return DB::table('order_packages')->insertGetId($values + [
            'order_id' => $orderId,
            'package_key' => $packageKey,
            'created_at' => now(),
        ]);
    }

    /** @param array<string, string> $row @param array<string, int> $occurrences */
    private function upsertItem(int $orderId, int $packageId, array $row, array &$occurrences): int
    {
        $signature = implode('|', [
            $packageId,
            $this->value($row, 'SKU ID') ?? '',
            $this->value($row, 'Seller SKU') ?? '',
            $this->value($row, 'Variation') ?? '',
        ]);
        $occurrences[$signature] = ($occurrences[$signature] ?? 0) + 1;
        $lineKey = hash('sha256', $signature.'|'.$occurrences[$signature]);
        $weight = $this->value($row, 'Weight(kg)');

        if ($weight !== null && preg_match('/^\d+(?:\.\d{1,3})?$/', $weight) !== 1) {
            throw new InvalidArgumentException("Berat tidak valid: {$weight}");
        }

        $values = [
            'order_package_id' => $packageId,
            'sku_id' => $this->value($row, 'SKU ID'),
            'seller_sku' => $this->value($row, 'Seller SKU'),
            'product_name' => $this->value($row, 'Product Name'),
            'variation' => $this->value($row, 'Variation'),
            'quantity' => $this->quantity($this->value($row, 'Quantity')),
            'returned_quantity' => $this->quantity($this->value($row, 'Sku Quantity of return')),
            'unit_original_price' => $this->money($this->value($row, 'SKU Unit Original Price')),
            'subtotal_before_discount' => $this->money($this->value($row, 'SKU Subtotal Before Discount')),
            'platform_discount' => $this->money($this->value($row, 'SKU Platform Discount')),
            'seller_discount' => $this->money($this->value($row, 'SKU Seller Discount')),
            'subtotal_after_discount' => $this->money($this->value($row, 'SKU Subtotal After Discount')),
            'item_insurance' => $this->money($this->value($row, 'Item Insurance')),
            'weight_kg' => $weight,
            'product_category' => $this->value($row, 'Product Category'),
            'updated_at' => now(),
        ];
        $query = DB::table('order_items')->where('order_id', $orderId)->where('line_key', $lineKey);
        $itemId = $query->value('id');

        if ($itemId !== null) {
            $query->update($values);

            return $itemId;
        }

        return DB::table('order_items')->insertGetId($values + [
            'order_id' => $orderId,
            'line_key' => $lineKey,
            'created_at' => now(),
        ]);
    }

    /** @param array<string, string> $row */
    private function saveImportRow(
        int $batchId,
        string $sheetName,
        int $rowNumber,
        array $row,
        string $rowHash,
        string $result,
        ?int $orderId = null,
        ?int $itemId = null,
        ?int $financialId = null,
        ?int $transferId = null,
        ?string $message = null,
    ): void {
        DB::table('import_rows')->insert([
            'import_batch_id' => $batchId,
            'order_id' => $orderId,
            'order_item_id' => $itemId,
            'financial_transaction_id' => $financialId,
            'financial_transfer_id' => $transferId,
            'sheet_name' => $sheetName,
            'row_number' => $rowNumber,
            'row_hash' => $rowHash,
            'result' => $result,
            'message' => $message,
            'raw_data' => $this->json($row),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /** @param array<int, array{row_number: int, cells: array<int, string>}> $rows @return array<string, string> */
    private function reportSummary(array $rows): array
    {
        $summary = [];

        foreach ($rows as $row) {
            $values = array_values(array_filter($row['cells'], static fn (string $value): bool => trim($value) !== ''));

            if (count($values) >= 2) {
                $summary[trim($values[0])] = trim($values[count($values) - 1]);
            }
        }

        return $summary;
    }
}
