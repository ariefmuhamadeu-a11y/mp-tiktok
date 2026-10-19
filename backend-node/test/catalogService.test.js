import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { ensureCatalogSchema } from '../src/database/catalogSchema.js';
import {
    applyBackfill,
    createMapping,
    createProduct,
    createVariant,
    listAuditLogs,
    listMappings,
    listUnmatchedOrderItems,
    previewBackfill
} from '../src/services/catalogService.js';

function withDatabase(callback) {
    const directory = mkdtempSync(path.join(tmpdir(), 'mp-catalog-'));
    const databasePath = path.join(directory, 'catalog.sqlite');
    const database = new DatabaseSync(databasePath);
    database.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, password TEXT, created_at TEXT, updated_at TEXT);
        CREATE TABLE stores (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, name TEXT, platform TEXT, is_active INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT);
        CREATE TABLE orders (id INTEGER PRIMARY KEY, store_id INTEGER, external_order_id TEXT, source_created_at TEXT);
        CREATE TABLE order_items (id INTEGER PRIMARY KEY, order_id INTEGER, sku_id TEXT, seller_sku TEXT, product_name TEXT, variation TEXT, quantity INTEGER);
        INSERT INTO users VALUES (1, 'Demo', 'demo@example.test', 'hash', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        INSERT INTO stores VALUES (1, 1, 'Toko Utama', 'tiktok', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        INSERT INTO orders VALUES (1, 1, 'ORDER-1', '2026-10-19 10:00:00');
        INSERT INTO order_items VALUES (1, 1, 'SKU-ID-1', 'SELLER-1', 'Produk lama', 'Merah', 2);
        INSERT INTO order_items VALUES (2, 1, 'SKU-ID-2', 'SELLER-2', 'Produk belum mapped', 'Biru', 1);
    `);
    ensureCatalogSchema(database);
    database.close();
    try { return callback(databasePath); }
    finally { rmSync(directory, { recursive: true, force: true }); }
}

test('creates product, variant, mapping, and classifies unmatched order items', () => {
    withDatabase((databasePath) => {
        const product = createProduct({ databasePath, userId: 1, code: 'PRD-001', name: 'Produk Internal' });
        const variant = createVariant({ databasePath, userId: 1, productId: product.id, sku: 'INT-RED', name: 'Merah', attributes: { warna: 'Merah' } });
        const mapping = createMapping({ databasePath, storeId: 1, productId: product.id, productVariantId: variant.id, sellerSku: 'SELLER-1', skuId: 'SKU-ID-1' });

        assert.equal(mapping.status, 'mapped');
        assert.deepEqual(mapping.productVariantId, variant.id);
        const mapped = listUnmatchedOrderItems({ databasePath, storeId: 1, status: 'mapped' });
        const unmatched = listUnmatchedOrderItems({ databasePath, storeId: 1 });
        assert.equal(mapped.total, 1);
        assert.equal(mapped.items[0].externalOrderId, 'ORDER-1');
        assert.equal(unmatched.total, 1);
        assert.equal(unmatched.items[0].sellerSku, 'SELLER-2');
        assert.equal(listMappings({ databasePath, storeId: 1 }).length, 1);

        const preview = previewBackfill({ databasePath, storeId: 1, actorUserId: 1 });
        assert.equal(preview.counts.eligible, 1);
        assert.equal(preview.counts.unmatched, 1);
        const applied = applyBackfill({ databasePath, storeId: 1, actorUserId: 1 });
        assert.equal(applied.mappedCount, 1);
        const repeat = applyBackfill({ databasePath, storeId: 1, actorUserId: 1 });
        assert.equal(repeat.mappedCount, 0);
        const after = previewBackfill({ databasePath, storeId: 1 });
        assert.equal(after.counts.alreadyBackfilled, 1);
        assert.equal(after.counts.eligible, 0);
        const audit = listAuditLogs({ databasePath, storeId: 1 });
        assert.ok(audit.some((log) => log.action === 'backfilled'));
        assert.ok(audit.some((log) => log.action === 'backfill_applied'));
        assert.ok(listAuditLogs({ databasePath }).some((log) => log.entityType === 'product'));
    });
});

test('rejects a duplicate marketplace SKU mapping', () => {
    withDatabase((databasePath) => {
        const product = createProduct({ databasePath, userId: 1, code: 'PRD-001', name: 'Produk Internal' });
        const variant = createVariant({ databasePath, userId: 1, productId: product.id, sku: 'INT-RED', name: 'Merah' });
        createMapping({ databasePath, storeId: 1, productId: product.id, productVariantId: variant.id, sellerSku: 'SELLER-1' });
        assert.throws(
            () => createMapping({ databasePath, storeId: 1, productId: product.id, productVariantId: variant.id, sellerSku: 'SELLER-1' }),
            { statusCode: 409 }
        );
    });
});
