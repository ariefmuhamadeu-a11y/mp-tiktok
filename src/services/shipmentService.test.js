import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { getUniqueShipmentRows, parseShipmentFile } from './shipmentService.js';

test('keeps different SKUs within one order and skips repeated item rows', () => {
    const rows = [
        { orderId: 'ORD-1', skuId: '100', sku: 'A', productTitle: 'Produk', variant: 'Merah', packageId: 'PKG-1' },
        { orderId: 'ORD-1', skuId: '200', sku: 'B', productTitle: 'Produk', variant: 'Biru', packageId: 'PKG-1' },
        { orderId: 'ORD-1', skuId: '100', sku: 'A', productTitle: 'Produk', variant: 'Merah', packageId: 'PKG-1' }
    ];

    const result = getUniqueShipmentRows(rows, 'Toko A', []);

    assert.equal(result.uniqueRows.length, 2);
    assert.equal(result.duplicateCount, 1);
    assert.deepEqual(result.uniqueRows.map((row) => row.skuId), ['100', '200']);
});

test('deduplicates within a store but not across stores', () => {
    const storedRows = [{ store: 'Toko A', orderId: 'ORD-1', skuId: '100', productTitle: 'Produk', variant: 'Merah', packageId: 'PKG-1', key: 'order:ord_1' }];
    const row = { orderId: 'ORD-1', skuId: '100', productTitle: 'Produk', variant: 'Merah', packageId: 'PKG-1' };

    assert.equal(getUniqueShipmentRows([{ ...row }], 'Toko A', storedRows).duplicateCount, 1);
    assert.equal(getUniqueShipmentRows([{ ...row }], 'Toko B', storedRows).uniqueRows.length, 1);
});

test('preserves long order and SKU identifiers from CSV as text', async () => {
    const file = new File(['Order ID,SKU ID,Product Name,Quantity\n586631997014050594,1735968782135035260,Produk A,1\n'], 'orders.csv');

    const rows = await parseShipmentFile(file);

    assert.equal(rows[0].orderId, '586631997014050594');
    assert.equal(rows[0].skuId, '1735968782135035260');
});

test('maps TikTok price and discount columns from shipment exports', async () => {
    const file = new File([
        'Order ID,SKU ID,SKU Unit Original Price,SKU Subtotal Before Discount,SKU Platform Discount,SKU Seller Discount,SKU Subtotal After Discount,Order Amount,Payment platform discount\n',
        'ORDER-PRICE-1,SKU-1,50000,100000,10000,5000,85000,90000,2000\n'
    ], 'shipment.csv');

    const rows = await parseShipmentFile(file);

    assert.equal(rows[0].unitOriginalPrice, '50000');
    assert.equal(rows[0].subtotalBeforeDiscount, '100000');
    assert.equal(rows[0].platformDiscount, '10000');
    assert.equal(rows[0].sellerDiscount, '5000');
    assert.equal(rows[0].subtotalAfterDiscount, '85000');
    assert.equal(rows[0].paymentPlatformDiscount, '2000');
});

test('preserves day-first CSV dates and their times without coercion', async () => {
    const file = new File([
        'Order ID,SKU ID,Product Name,Created Time,Shipped Time,Delivered Time\n',
        '586551105466173252,1735968782135035260,Produk A,12/10/2026 15:51:07,13/10/2026 08:09:10,14/10/2026 21:22:23\n'
    ], 'orders.csv');

    const rows = await parseShipmentFile(file);

    assert.equal(rows[0].createdAt, '12/10/2026 15:51:07');
    assert.equal(rows[0].shippedAt, '13/10/2026 08:09:10');
    assert.equal(rows[0].deliveredAt, '14/10/2026 21:22:23');
});

test('converts numeric XLSX date cells to unambiguous local date-times', async () => {
    const serial = (Date.UTC(2026, 9, 12, 15, 51, 7) - Date.UTC(1899, 11, 30)) / 86400000;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
        ['Order ID', 'SKU ID', 'Created Time'],
        ['ORDER-1', 'SKU-1', serial]
    ]), 'Orders');
    const file = new File([XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })], 'orders.xlsx');

    const rows = await parseShipmentFile(file);

    assert.equal(rows[0].createdAt, '2026-10-12 15:51:07');
});

test('rejects an income CSV that does not identify orders and items', async () => {
    const file = new File(['Jenis transaksi,Total\nPesanan,1000\n'], 'income.csv');

    await assert.rejects(() => parseShipmentFile(file), /Order ID dan identitas produk/);
});
