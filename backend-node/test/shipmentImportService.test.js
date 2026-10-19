import assert from 'node:assert/strict';
import { copyFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { commerceDatabasePath } from '../src/services/workspaceService.js';
import { importShipmentRows } from '../src/services/shipmentImportService.js';

test('imports shipment rows and links matching financial transactions', (t) => {
    const databasePath = join(tmpdir(), `mp-tiktok-shipment-${process.pid}-${Date.now()}.sqlite`);
    copyFileSync(commerceDatabasePath, databasePath);
    t.after(() => unlinkSync(databasePath));

    const candidate = { external_reference_id: `SHIPMENT-TEST-${process.pid}` };
    const source = new DatabaseSync(databasePath);
    source.prepare(`
        INSERT INTO financial_transactions (
            store_id, order_id, event_key, content_hash, external_reference_id,
            transaction_type, ordered_on, credited_on, currency, settlement_amount,
            total_revenue, total_fees, refund_after_discount, platform_commission,
            logistics_service_fee, shipping_fee, seller_discount, breakdown,
            created_at, updated_at
        ) VALUES (?, NULL, ?, ?, ?, 'Pesanan', '2026-10-18', '2026-10-19', 'IDR',
            70000, 100000, 30000, 0, 10000, 5000, 5000, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(1, 'e'.repeat(64), 'f'.repeat(64), candidate.external_reference_id, '{}');
    source.close();

    const result = importShipmentRows({
        databasePath,
        storeId: 1,
        fileName: 'shipment-test.csv',
        rows: [{
            orderId: candidate.external_reference_id,
            packageId: 'PKG-TEST',
            tracking: 'RESI-TEST',
            courier: 'J&T Express',
            status: 'Delivered',
            item: '2',
            productTitle: 'Produk Uji',
            sku: 'SKU-TEST',
            total: 'Rp102.573',
            createdAt: '12/10/2026 15:51:07',
            deliveredAt: '18/10/2026 10:30:00'
        }]
    });

    assert.equal(result.createdOrderCount, 1);
    assert.equal(result.createdPackageCount, 1);
    assert.equal(result.createdItemCount, 1);
    assert.equal(result.linkedTransactionCount, 1);

    const verify = new DatabaseSync(databasePath, { readOnly: true });
    const row = verify.prepare(`
        SELECT o.external_order_id, o.source_created_at, p.tracking_id, p.delivered_at, i.quantity, t.order_id
        FROM orders o
        JOIN order_packages p ON p.order_id = o.id
        JOIN order_items i ON i.order_package_id = p.id
        JOIN financial_transactions t ON t.order_id = o.id
        WHERE o.external_order_id = ?
    `).get(candidate.external_reference_id);
    verify.close();

    assert.equal(row.tracking_id, 'RESI-TEST');
    assert.equal(row.source_created_at, '2026-10-12 15:51:07');
    assert.equal(row.delivered_at, '2026-10-18 10:30:00');
    assert.equal(row.quantity, 2);
    assert.ok(row.order_id);
});

test('reads two-digit day-first years without swapping the month and day', (t) => {
    const databasePath = join(tmpdir(), `mp-tiktok-shipment-short-year-${process.pid}-${Date.now()}.sqlite`);
    copyFileSync(commerceDatabasePath, databasePath);
    t.after(() => unlinkSync(databasePath));

    importShipmentRows({
        databasePath,
        storeId: 1,
        fileName: 'short-year.csv',
        rows: [{ orderId: 'SHORT-YEAR-1', sku: 'SKU-1', createdAt: '12/10/26 15:51:07' }]
    });

    const verify = new DatabaseSync(databasePath, { readOnly: true });
    const row = verify.prepare('SELECT source_created_at FROM orders WHERE external_order_id = ?').get('SHORT-YEAR-1');
    verify.close();
    assert.equal(row.source_created_at, '2026-10-12 15:51:07');
});

test('stores TikTok item subtotals and discounts from shipment rows', (t) => {
    const databasePath = join(tmpdir(), `mp-tiktok-shipment-finance-${process.pid}-${Date.now()}.sqlite`);
    copyFileSync(commerceDatabasePath, databasePath);
    t.after(() => unlinkSync(databasePath));

    importShipmentRows({
        databasePath,
        storeId: 1,
        fileName: 'shipment-finance.csv',
        rows: [{
            orderId: 'FINANCE-1', sku: 'SKU-1', item: '2', total: '90000',
            unitOriginalPrice: '50000', subtotalBeforeDiscount: '100000',
            platformDiscount: '10000', sellerDiscount: '5000', subtotalAfterDiscount: '85000',
            orderRefundAmount: '0', paymentPlatformDiscount: '2000', buyerServiceFee: '1500', handlingFee: '500',
            shippingFeeAfterDiscount: '10000', originalShippingFee: '15000',
            shippingFeeSellerDiscount: '2000', shippingFeePlatformDiscount: '3000',
            distanceShippingFee: '1000', distanceFee: '500', shippingInsurance: '250'
        }]
    });

    const verify = new DatabaseSync(databasePath, { readOnly: true });
    const row = verify.prepare(`
        SELECT o.order_refund_amount, o.payment_platform_discount, o.buyer_service_fee, o.handling_fee,
            p.shipping_fee_after_discount, p.original_shipping_fee, p.shipping_fee_seller_discount,
            p.shipping_fee_platform_discount, p.distance_shipping_fee, p.distance_fee, p.shipping_insurance,
            i.unit_original_price, i.subtotal_before_discount, i.platform_discount,
            i.seller_discount, i.subtotal_after_discount
        FROM orders o JOIN order_packages p ON p.order_id = o.id
            JOIN order_items i ON i.order_id = o.id AND i.order_package_id = p.id
        WHERE o.external_order_id = ?
    `).get('FINANCE-1');
    verify.close();

    assert.equal(row.order_refund_amount, 0);
    assert.equal(row.payment_platform_discount, 2000);
    assert.equal(row.buyer_service_fee, 1500);
    assert.equal(row.handling_fee, 500);
    assert.equal(row.shipping_fee_after_discount, 10000);
    assert.equal(row.original_shipping_fee, 15000);
    assert.equal(row.shipping_fee_seller_discount, 2000);
    assert.equal(row.shipping_fee_platform_discount, 3000);
    assert.equal(row.distance_shipping_fee, 1000);
    assert.equal(row.distance_fee, 500);
    assert.equal(row.shipping_insurance, 250);
    assert.equal(row.unit_original_price, 50000);
    assert.equal(row.subtotal_before_discount, 100000);
    assert.equal(row.platform_discount, 10000);
    assert.equal(row.seller_discount, 5000);
    assert.equal(row.subtotal_after_discount, 85000);
});

test('rejects invalid source dates without saving a partial import', (t) => {
    const databasePath = join(tmpdir(), `mp-tiktok-shipment-invalid-date-${process.pid}-${Date.now()}.sqlite`);
    copyFileSync(commerceDatabasePath, databasePath);
    t.after(() => unlinkSync(databasePath));

    assert.throws(() => importShipmentRows({
        databasePath,
        storeId: 1,
        fileName: 'invalid-date.csv',
        rows: [
            { orderId: 'VALID-1', sku: 'SKU-1', createdAt: '12/10/2026 15:51:07' },
            { orderId: 'INVALID-1', sku: 'SKU-2', createdAt: '31/02/2026 15:51:07', sourceRow: 3 }
        ]
    }), /Tanggal pesanan tidak valid pada baris 3/);

    const verify = new DatabaseSync(databasePath, { readOnly: true });
    assert.equal(verify.prepare(`
        SELECT COUNT(*) AS count FROM orders
        WHERE external_order_id IN ('VALID-1', 'INVALID-1')
    `).get().count, 0);
    verify.close();
});
