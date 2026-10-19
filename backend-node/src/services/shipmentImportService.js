import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { commerceDatabasePath } from './workspaceService.js';

const text = (value) => String(value ?? '').trim();

function fail(message, statusCode = 422) {
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;
}

function cleanIdentifier(value) {
    return text(value).replace(/^['"]|['"]$/g, '').trim();
}

function parseInteger(value) {
    const raw = text(value);
    if (!raw) return null;
    const negative = raw.includes('-');
    const normalized = raw.replace(/[.,](\d{1,2})$/, '').replace(/[^0-9]/g, '');
    if (!normalized) return null;
    const result = Number(normalized);
    return Number.isSafeInteger(result) ? (negative ? -result : result) : null;
}

function parseDateTime(value) {
    const raw = text(value);
    if (!raw) return null;
    const formatParts = (year, month, day, hour = '0', minute = '0', second = '0') => {
        const [y, m, d, h, min, s] = [year, month, day, hour, minute, second].map(Number);
        const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
        if (y < 1900 || m < 1 || m > 12 || d < 1 || d > daysInMonth || h > 23 || min > 59 || s > 59) return null;
        const pad = (part) => String(part).padStart(2, '0');
        return `${y}-${pad(m)}-${pad(d)} ${pad(h)}:${pad(min)}:${pad(s)}`;
    };
    const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (iso) return formatParts(...iso.slice(1));

    const dmy = raw.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4}|\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (dmy) {
        const [, day, month, sourceYear, hour, minute, second] = dmy;
        const shortYear = Number(sourceYear);
        const year = sourceYear.length === 2 ? String(shortYear < 70 ? 2000 + shortYear : 1900 + shortYear) : sourceYear;
        return formatParts(year, month, day, hour, minute, second);
    }

    const zoned = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i);
    if (!zoned || !formatParts(...zoned.slice(1, 7))) return null;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(parsed).filter(({ type }) => type !== 'literal').map(({ type, value: partValue }) => [type, partValue]));
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function hash(value) {
    return createHash('sha256').update(String(value)).digest('hex');
}

function fileHash(fileName, rows) {
    return hash(JSON.stringify({ fileName: text(fileName), rows }));
}

function shipmentPackageKey(row) {
    const explicit = cleanIdentifier(row.packageId);
    if (explicit) return explicit.slice(0, 120);
    const tracking = cleanIdentifier(row.tracking);
    if (tracking) return tracking.slice(0, 120);
    return `shipment-${hash(text(row.orderId)).slice(0, 56)}`;
}

function shipmentLineKey(row, packageKey) {
    return hash([
        packageKey, row.key, row.skuId, row.sku, row.variant, row.productTitle
    ].map(text).join('|'));
}

function normalizeRow(row) {
    if (!row || typeof row !== 'object') return null;
    const normalized = {
        ...row,
        orderId: cleanIdentifier(row.orderId),
        createdAt: text(row.createdAt),
        item: text(row.item),
        productTitle: text(row.productTitle),
        variant: text(row.variant),
        sku: text(row.sku),
        skuId: text(row.skuId),
        packageId: cleanIdentifier(row.packageId),
        tracking: cleanIdentifier(row.tracking),
        recipient: text(row.recipient),
        courier: text(row.courier),
        shippedAt: text(row.shippedAt),
        deliveredAt: text(row.deliveredAt),
        status: text(row.status),
        total: text(row.total),
        unitOriginalPrice: text(row.unitOriginalPrice),
        subtotalBeforeDiscount: text(row.subtotalBeforeDiscount),
        platformDiscount: text(row.platformDiscount),
        sellerDiscount: text(row.sellerDiscount),
        subtotalAfterDiscount: text(row.subtotalAfterDiscount),
        orderRefundAmount: text(row.orderRefundAmount),
        paymentPlatformDiscount: text(row.paymentPlatformDiscount),
        buyerServiceFee: text(row.buyerServiceFee),
        handlingFee: text(row.handlingFee),
        shippingFeeAfterDiscount: text(row.shippingFeeAfterDiscount),
        originalShippingFee: text(row.originalShippingFee),
        shippingFeeSellerDiscount: text(row.shippingFeeSellerDiscount),
        shippingFeePlatformDiscount: text(row.shippingFeePlatformDiscount),
        distanceShippingFee: text(row.distanceShippingFee),
        distanceFee: text(row.distanceFee),
        shippingInsurance: text(row.shippingInsurance),
        itemInsurance: text(row.itemInsurance)
    };
    return normalized.orderId ? normalized : null;
}

function upsertOrder(database, storeId, row) {
    const existing = database.prepare(
        'SELECT id FROM orders WHERE store_id = ? AND external_order_id = ?'
    ).get(storeId, row.orderId);
    const amount = parseInteger(row.total);
    const orderRefundAmount = parseInteger(row.orderRefundAmount);
    const paymentPlatformDiscount = parseInteger(row.paymentPlatformDiscount);
    const buyerServiceFee = parseInteger(row.buyerServiceFee);
    const handlingFee = parseInteger(row.handlingFee);
    const createdAt = parseDateTime(row.createdAt);
    if (row.createdAt && !createdAt) fail(`Tanggal pesanan tidak valid pada baris ${row.sourceRow || '?'}: ${row.createdAt}`);

    if (existing) {
        database.prepare(`
            UPDATE orders SET
                source_order_status = COALESCE(NULLIF(?, ''), source_order_status),
                order_amount = COALESCE(?, order_amount),
                order_refund_amount = COALESCE(?, order_refund_amount),
                payment_platform_discount = COALESCE(?, payment_platform_discount),
                buyer_service_fee = COALESCE(?, buyer_service_fee),
                handling_fee = COALESCE(?, handling_fee),
                source_created_at = COALESCE(?, source_created_at),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(row.status, amount, orderRefundAmount, paymentPlatformDiscount, buyerServiceFee, handlingFee, createdAt, existing.id);
        return { id: existing.id, created: false };
    }

    const inserted = database.prepare(`
        INSERT INTO orders (
            store_id, external_order_id, source_order_status, order_amount,
            order_refund_amount, payment_platform_discount, buyer_service_fee, handling_fee,
            source_created_at, financial_status, created_at, updated_at
        ) VALUES (?, ?, NULLIF(?, ''), ?, ?, ?, ?, ?, ?, 'not_reported', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
    `).get(storeId, row.orderId, row.status, amount, orderRefundAmount, paymentPlatformDiscount, buyerServiceFee, handlingFee, createdAt);
    return { id: inserted.id, created: true };
}

function upsertPackage(database, orderId, row) {
    const packageKey = shipmentPackageKey(row);
    const existing = database.prepare(
        'SELECT id FROM order_packages WHERE order_id = ? AND package_key = ?'
    ).get(orderId, packageKey);
    const shippedAt = parseDateTime(row.shippedAt);
    const deliveredAt = parseDateTime(row.deliveredAt);
    const packageFees = [
        parseInteger(row.shippingFeeAfterDiscount),
        parseInteger(row.originalShippingFee),
        parseInteger(row.shippingFeeSellerDiscount),
        parseInteger(row.shippingFeePlatformDiscount),
        parseInteger(row.distanceShippingFee),
        parseInteger(row.distanceFee),
        parseInteger(row.shippingInsurance)
    ];
    if (row.shippedAt && !shippedAt) fail(`Waktu kirim tidak valid pada baris ${row.sourceRow || '?'}: ${row.shippedAt}`);
    if (row.deliveredAt && !deliveredAt) fail(`Waktu diterima tidak valid pada baris ${row.sourceRow || '?'}: ${row.deliveredAt}`);

    if (existing) {
        database.prepare(`
            UPDATE order_packages SET
                external_package_id = COALESCE(NULLIF(?, ''), external_package_id),
                tracking_id = COALESCE(NULLIF(?, ''), tracking_id),
                shipping_provider_name = COALESCE(NULLIF(?, ''), shipping_provider_name),
                shipped_at = COALESCE(?, shipped_at),
                delivered_at = COALESCE(?, delivered_at),
                recipient = COALESCE(NULLIF(?, ''), recipient),
                shipping_fee_after_discount = COALESCE(?, shipping_fee_after_discount),
                original_shipping_fee = COALESCE(?, original_shipping_fee),
                shipping_fee_seller_discount = COALESCE(?, shipping_fee_seller_discount),
                shipping_fee_platform_discount = COALESCE(?, shipping_fee_platform_discount),
                distance_shipping_fee = COALESCE(?, distance_shipping_fee),
                distance_fee = COALESCE(?, distance_fee),
                shipping_insurance = COALESCE(?, shipping_insurance),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(row.packageId, row.tracking, row.courier, shippedAt, deliveredAt, row.recipient, ...packageFees, existing.id);
        return { id: existing.id, key: packageKey, created: false };
    }

    const inserted = database.prepare(`
        INSERT INTO order_packages (
            order_id, package_key, external_package_id, tracking_id,
            shipping_provider_name, shipped_at, delivered_at, recipient,
            shipping_fee_after_discount, original_shipping_fee,
            shipping_fee_seller_discount, shipping_fee_platform_discount,
            distance_shipping_fee, distance_fee, shipping_insurance,
            created_at, updated_at
        ) VALUES (?, ?, NULLIF(?, ''), NULLIF(?, ''), NULLIF(?, ''), ?, ?, NULLIF(?, ''), ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
    `).get(orderId, packageKey, row.packageId, row.tracking, row.courier, shippedAt, deliveredAt, row.recipient, ...packageFees);
    return { id: inserted.id, key: packageKey, created: true };
}

function upsertItem(database, orderId, shipmentPackage, row) {
    const lineKey = shipmentLineKey(row, shipmentPackage.key);
    const existing = database.prepare(
        'SELECT id FROM order_items WHERE order_id = ? AND line_key = ?'
    ).get(orderId, lineKey);
    const quantity = parseInteger(row.item);
    const values = [
        row.skuId, row.sku, row.productTitle, row.variant, quantity,
        parseInteger(row.unitOriginalPrice),
        parseInteger(row.subtotalBeforeDiscount),
        parseInteger(row.platformDiscount),
        parseInteger(row.sellerDiscount),
        parseInteger(row.subtotalAfterDiscount),
        parseInteger(row.itemInsurance)
    ];

    if (existing) {
        database.prepare(`
            UPDATE order_items SET
                sku_id = COALESCE(NULLIF(?, ''), sku_id),
                seller_sku = COALESCE(NULLIF(?, ''), seller_sku),
                product_name = COALESCE(NULLIF(?, ''), product_name),
                variation = COALESCE(NULLIF(?, ''), variation),
                quantity = COALESCE(?, quantity),
                unit_original_price = COALESCE(?, unit_original_price),
                subtotal_before_discount = COALESCE(?, subtotal_before_discount),
                platform_discount = COALESCE(?, platform_discount),
                seller_discount = COALESCE(?, seller_discount),
                subtotal_after_discount = COALESCE(?, subtotal_after_discount),
                item_insurance = COALESCE(?, item_insurance),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(...values, existing.id);
        return { id: existing.id, created: false };
    }

    const inserted = database.prepare(`
        INSERT INTO order_items (
            order_id, order_package_id, line_key, sku_id, seller_sku,
            product_name, variation, quantity, unit_original_price,
            subtotal_before_discount, platform_discount, seller_discount,
            subtotal_after_discount, item_insurance, created_at, updated_at
        ) VALUES (?, ?, ?, NULLIF(?, ''), NULLIF(?, ''), NULLIF(?, ''), NULLIF(?, ''), ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
    `).get(orderId, shipmentPackage.id, lineKey, ...values);
    return { id: inserted.id, created: true };
}

function linkTransaction(database, storeId, row, orderId) {
    const result = database.prepare(`
        UPDATE financial_transactions
        SET order_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE store_id = ? AND order_id IS NULL AND transaction_type = 'Pesanan'
            AND TRIM(external_reference_id) = ?
    `).run(orderId, storeId, row.orderId);
    return Number(result.changes || 0);
}

function refreshFinancialStatus(database, orderId) {
    database.prepare(`
        UPDATE orders SET
            financial_status = CASE
                WHEN EXISTS (
                    SELECT 1 FROM financial_transactions
                    WHERE order_id = orders.id AND credited_on IS NOT NULL
                ) THEN 'credited_to_balance'
                ELSE financial_status
            END,
            balance_credited_on = CASE
                WHEN EXISTS (
                    SELECT 1 FROM financial_transactions
                    WHERE order_id = orders.id AND credited_on IS NOT NULL
                ) THEN (
                    SELECT MIN(credited_on) FROM financial_transactions
                    WHERE order_id = orders.id AND credited_on IS NOT NULL
                )
                ELSE balance_credited_on
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(orderId);
}

function saveImportBatch(database, storeId, fileName, rows, report) {
    const digest = fileHash(fileName, rows);
    const existing = database.prepare(
        'SELECT id FROM import_batches WHERE store_id = ? AND kind = ? AND file_sha256 = ?'
    ).get(storeId, 'shipment', digest);
    const summary = JSON.stringify(report);
    if (existing) {
        database.prepare(`
            UPDATE import_batches SET status = 'completed', report_summary = ?,
                row_count = ?, imported_count = ?, duplicate_count = ?,
                unmatched_count = ?, error_count = 0, imported_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(summary, report.rowCount, report.importedCount, report.duplicateCount,
            report.unmatchedCount, existing.id);
        return existing.id;
    }
    return database.prepare(`
        INSERT INTO import_batches (
            store_id, kind, filename, file_sha256, status, report_summary,
            row_count, imported_count, duplicate_count, unmatched_count,
            error_count, imported_at, created_at, updated_at
        ) VALUES (?, 'shipment', ?, ?, 'completed', ?, ?, ?, ?, ?, 0,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
    `).get(storeId, text(fileName) || 'import-pengiriman', digest, summary,
        report.rowCount, report.importedCount, report.duplicateCount, report.unmatchedCount).id;
}

export function importShipmentRows({ storeId, fileName, rows, databasePath = commerceDatabasePath }) {
    if (!Number.isInteger(Number(storeId)) || Number(storeId) < 1) fail('Toko tujuan tidak valid.');
    if (!Array.isArray(rows) || !rows.length) fail('Tidak ada baris data pengiriman yang bisa diimpor.');
    if (!existsSync(databasePath)) fail('Database impor belum tersedia.', 503);

    const database = new DatabaseSync(databasePath);
    database.exec('PRAGMA foreign_keys = ON;');
    try {
        const store = database.prepare('SELECT id, name FROM stores WHERE id = ?').get(Number(storeId));
        if (!store) fail('Toko tujuan tidak ditemukan.', 404);
        const normalizedRows = rows.map(normalizeRow).filter(Boolean);
        if (!normalizedRows.length) fail('Kolom Order ID tidak ditemukan pada data pengiriman.');

        const report = {
            rowCount: normalizedRows.length,
            importedCount: 0,
            duplicateCount: Math.max(0, rows.length - normalizedRows.length),
            unmatchedCount: 0,
            linkedTransactionCount: 0,
            createdOrderCount: 0,
            createdPackageCount: 0,
            createdItemCount: 0
        };
        const orderIds = new Set();
        database.exec('BEGIN IMMEDIATE');
        try {
            for (const row of normalizedRows) {
                const order = upsertOrder(database, store.id, row);
                const shipmentPackage = upsertPackage(database, order.id, row);
                const item = upsertItem(database, order.id, shipmentPackage, row);
                report.importedCount += 1;
                report.createdOrderCount += order.created ? 1 : 0;
                report.createdPackageCount += shipmentPackage.created ? 1 : 0;
                report.createdItemCount += item.created ? 1 : 0;
                report.linkedTransactionCount += linkTransaction(database, store.id, row, order.id);
                orderIds.add(order.id);
            }
            for (const orderId of orderIds) refreshFinancialStatus(database, orderId);
            const batchId = saveImportBatch(database, store.id, fileName, normalizedRows, report);
            database.exec('COMMIT');
            return { store, batchId, ...report };
        } catch (error) {
            database.exec('ROLLBACK');
            throw error;
        }
    } finally {
        database.close();
    }
}
