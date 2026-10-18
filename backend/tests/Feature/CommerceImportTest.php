<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use App\Services\CommerceFileImporter;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;
use ZipArchive;

class CommerceImportTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_shipment_import_keeps_multiple_items_and_skips_repeated_file(): void
    {
        Storage::fake('local');
        $store = $this->store();
        $path = $this->shipmentFile();
        $importer = $this->app->make(CommerceFileImporter::class);

        $result = $importer->importShipmentCsv($store->id, $path);
        $repeat = $importer->importShipmentCsv($store->id, $path);

        $this->assertSame('imported', $result['status']);
        $this->assertSame(3, $result['row_count']);
        $this->assertSame(2, $result['imported_count']);
        $this->assertSame(1, $result['duplicate_count']);
        $this->assertSame('already_imported', $repeat['status']);
        $this->assertDatabaseCount('orders', 1);
        $this->assertDatabaseCount('order_packages', 1);
        $this->assertDatabaseCount('order_items', 2);
        $this->assertDatabaseCount('import_rows', 3);
        $this->assertDatabaseHas('orders', [
            'store_id' => $store->id,
            'external_order_id' => '586585924301587662',
            'source_order_status' => 'Dikirim',
        ]);
    }

    public function test_income_import_links_only_order_transactions_and_does_not_count_withdrawal_twice(): void
    {
        Storage::fake('local');
        $store = $this->store();
        $importer = $this->app->make(CommerceFileImporter::class);
        $importer->importShipmentCsv($store->id, $this->shipmentFile());
        $path = $this->incomeFile();

        $result = $importer->importIncomeXlsx($store->id, $path);
        $repeat = $importer->importIncomeXlsx($store->id, $path);

        $this->assertSame('imported', $result['status']);
        $this->assertSame(4, $result['row_count']);
        $this->assertSame(4, $result['imported_count']);
        $this->assertSame(1, $result['unmatched_count']);
        $this->assertSame('already_imported', $repeat['status']);
        $this->assertDatabaseCount('financial_transactions', 3);
        $this->assertDatabaseCount('financial_transfers', 1);
        $this->assertDatabaseHas('financial_transactions', [
            'external_reference_id' => '586585924301587662',
            'settlement_amount' => 900,
            'order_id' => DB::table('orders')->where('external_order_id', '586585924301587662')->value('id'),
        ]);
        $this->assertDatabaseHas('financial_transactions', [
            'external_reference_id' => '999',
            'settlement_amount' => 0,
            'order_id' => null,
        ]);
        $this->assertDatabaseHas('financial_transactions', [
            'external_reference_id' => 'AD-1',
            'settlement_amount' => -50,
            'order_id' => null,
        ]);
        $this->assertDatabaseHas('financial_transfers', [
            'external_reference_id' => 'AD-1',
            'transfer_type' => 'GMV Pay Deduction',
            'amount' => -50,
        ]);
        $this->assertDatabaseHas('import_rows', [
            'sheet_name' => 'Riwayat penarikan',
            'result' => 'imported',
        ]);
        $this->assertDatabaseHas('orders', [
            'external_order_id' => '586585924301587662',
            'source_order_status' => 'Dikirim',
            'financial_status' => 'credited_to_balance',
            'balance_credited_on' => '2026-10-18',
        ]);
        $this->assertDatabaseHas('import_batches', [
            'kind' => 'income',
            'status' => 'completed',
            'warning' => 'Total Laporan tidak sama dengan jumlah baris Detail pesanan; ringkasan tidak dipakai untuk status order.',
        ]);
    }

    public function test_refunded_order_is_not_marked_as_credited_to_balance(): void
    {
        Storage::fake('local');
        $store = $this->store();
        $importer = $this->app->make(CommerceFileImporter::class);
        $importer->importShipmentCsv($store->id, $this->shipmentFile());

        $importer->importIncomeXlsx($store->id, $this->incomeFile(refundMatchedOrder: true));

        $this->assertDatabaseHas('orders', [
            'external_order_id' => '586585924301587662',
            'source_order_status' => 'Dikirim',
            'financial_status' => 'refunded',
            'balance_credited_on' => null,
        ]);
    }

    private function store(): Store
    {
        return Store::create([
            'user_id' => User::factory()->create()->id,
            'name' => 'Toko Tes',
            'slug' => 'toko-tes',
            'platform' => 'tiktok',
            'is_active' => true,
        ]);
    }

    private function shipmentFile(): string
    {
        $csv = implode("\n", [
            'Order ID,SKU ID,Package ID,Seller SKU,Product Name,Variation,Order Status,Quantity',
            '586585924301587662,SKU-1,PKG-1,SELLER-1,Produk A,Merah,Dikirim,1',
            '586585924301587662,SKU-2,PKG-1,SELLER-2,Produk B,Biru,Dikirim,2',
            '586585924301587662,SKU-2,PKG-1,SELLER-2,Produk B,Biru,Dikirim,2',
        ]);
        Storage::disk('local')->put('shipment.csv', $csv);

        return Storage::disk('local')->path('shipment.csv');
    }

    private function incomeFile(bool $refundMatchedOrder = false): string
    {
        $path = Storage::disk('local')->path('income.xlsx');
        $archive = new ZipArchive;
        $archive->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        $archive->addFromString('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Detail pesanan" sheetId="1" r:id="rId1"/><sheet name="Laporan" sheetId="2" r:id="rId2"/><sheet name="Riwayat penarikan" sheetId="3" r:id="rId3"/></sheets></workbook>');
        $archive->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Target="worksheets/sheet3.xml"/></Relationships>');
        $archive->addFromString('xl/worksheets/sheet1.xml', $this->worksheet([
            ['ID Pesanan/Penyesuaian', 'Jenis transaksi', 'Waktu pembayaran pesanan', 'Jumlah penyelesaian pembayaran', 'Total Pendapatan', 'Total Biaya', 'Total pengembalian dana setelah diskon'],
            ['586585924301587662', 'Pesanan', '2026/10/18', $refundMatchedOrder ? '0' : '900', $refundMatchedOrder ? '0' : '1000', $refundMatchedOrder ? '0' : '-100', $refundMatchedOrder ? '-1000' : '0'],
            ['999', 'Pesanan', '2026/10/18', '0', '0', '0', '-200'],
            ['AD-1', 'Pembayaran GMV untuk Iklan TikTok', '2026/10/18', '-50', '0', '0', '0'],
        ]));
        $archive->addFromString('xl/worksheets/sheet2.xml', $this->worksheet([
            ['Jumlah penyelesaian pembayaran', '999'],
        ]));
        $archive->addFromString('xl/worksheets/sheet3.xml', $this->worksheet([
            ['Jenis transaksi', 'ID referensi', 'Total'],
            ['GMV Pay Deduction', 'AD-1', '-50'],
        ]));
        $archive->close();

        return $path;
    }

    /** @param array<int, array<int, string>> $rows */
    private function worksheet(array $rows): string
    {
        $xml = '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';

        foreach ($rows as $rowIndex => $values) {
            $number = $rowIndex + 1;
            $xml .= "<row r=\"{$number}\">";

            foreach ($values as $columnIndex => $value) {
                $column = chr(ord('A') + $columnIndex);
                $text = htmlspecialchars($value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
                $xml .= "<c r=\"{$column}{$number}\" t=\"inlineStr\"><is><t>{$text}</t></is></c>";
            }

            $xml .= '</row>';
        }

        return $xml.'</sheetData></worksheet>';
    }
}
