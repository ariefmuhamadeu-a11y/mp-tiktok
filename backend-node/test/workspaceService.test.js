import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { readWorkspace } from '../src/services/workspaceService.js';

function withDatabase(callback) {
    const directory = mkdtempSync(path.join(tmpdir(), 'mp-workspace-'));
    const databasePath = path.join(directory, 'test.sqlite');
    const database = new DatabaseSync(databasePath);
    try {
        database.exec(`
            CREATE TABLE stores (id INTEGER PRIMARY KEY, name TEXT);
            CREATE TABLE orders (id INTEGER PRIMARY KEY, store_id INTEGER, external_order_id TEXT, source_order_status TEXT, financial_status TEXT, order_amount INTEGER, payment_platform_discount INTEGER, source_created_at TEXT);
            CREATE TABLE order_packages (id INTEGER PRIMARY KEY, order_id INTEGER, tracking_id TEXT, shipping_provider_name TEXT, shipped_at TEXT, delivered_at TEXT);
            CREATE TABLE order_items (id INTEGER PRIMARY KEY, order_id INTEGER, order_package_id INTEGER, product_name TEXT, variation TEXT, seller_sku TEXT, sku_id TEXT, quantity INTEGER, seller_discount INTEGER, platform_discount INTEGER);
            CREATE TABLE financial_transactions (id INTEGER PRIMARY KEY, store_id INTEGER, order_id INTEGER, transaction_type TEXT, settlement_amount INTEGER);
            CREATE TABLE financial_transfers (id INTEGER PRIMARY KEY, store_id INTEGER, transfer_type TEXT, amount INTEGER);
            CREATE TABLE import_batches (id INTEGER PRIMARY KEY, store_id INTEGER, kind TEXT, filename TEXT, status TEXT, row_count INTEGER, imported_count INTEGER, duplicate_count INTEGER, unmatched_count INTEGER, error_count INTEGER, imported_at TEXT);
            INSERT INTO stores VALUES (1, 'Demo'), (2, 'Lain');
            INSERT INTO orders VALUES (1, 1, 'ORD-1', 'Dikirim', 'credited_to_balance', 100000, 3000, '2026-10-19 10:00:00'), (2, 2, 'ORD-2', 'Dikirim', 'not_reported', 200000, 0, '2026-10-19 11:00:00');
            INSERT INTO order_packages VALUES (1, 1, 'RESI-1', 'Kurir', '2026-10-19 10:00:00', NULL);
            INSERT INTO order_items VALUES (1, 1, 1, 'Produk A', 'Merah', 'SKU-A', '100', 2, 10000, 5000);
            INSERT INTO financial_transactions VALUES (1, 1, 1, 'Pesanan', 80000), (2, 1, NULL, 'Iklan', -5000), (3, 2, NULL, 'Pesanan', 190000);
            INSERT INTO financial_transfers VALUES (1, 1, 'Withdrawal', -50000);
            INSERT INTO import_batches VALUES (1, 1, 'shipment', 'pesanan.csv', 'completed', 1, 1, 0, 0, 0, '2026-10-19 12:00:00');
        `);
        database.close();
        return callback(databasePath);
    } finally {
        if (database.isOpen) database.close();
        rmSync(directory, { recursive: true, force: true });
    }
}

test('dashboard scopes orders and finance to the selected store without recipient data', () => {
    withDatabase((databasePath) => {
        const result = readWorkspace(1, databasePath);

        assert.equal(result.selectedStoreId, 1);
        assert.equal(result.summary.total_orders, 1);
        assert.equal(result.summary.credited_orders, 1);
        assert.equal(result.summary.order_settlement, 80000);
        assert.equal(result.summary.other_settlement, -5000);
        assert.equal(result.summary.withdrawal_amount, -50000);
        assert.equal(result.summary.seller_product_discount, 10000);
        assert.equal(result.summary.platform_product_discount, 5000);
        assert.equal(result.summary.payment_platform_discount, 3000);
        assert.equal(result.orders.length, 1);
        assert.equal(result.orders[0].sellerSku, 'SKU-A');
        assert.equal(result.orders[0].recipient, undefined);
        assert.equal(result.imports[0].filename, 'pesanan.csv');
    });
});

test('dashboard rejects an unknown store', () => {
    withDatabase((databasePath) => {
        assert.throws(() => readWorkspace(99, databasePath), { statusCode: 404 });
    });
});

test('dashboard explains when the import database is absent', () => {
    assert.throws(() => readWorkspace(null, '/missing/mp-tiktok.sqlite'), { statusCode: 503 });
});
