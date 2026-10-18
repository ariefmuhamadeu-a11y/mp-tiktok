import assert from 'node:assert/strict';
import test from 'node:test';
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

test('rejects an income CSV that does not identify orders and items', async () => {
    const file = new File(['Jenis transaksi,Total\nPesanan,1000\n'], 'income.csv');

    await assert.rejects(() => parseShipmentFile(file), /Order ID dan identitas produk/);
});
