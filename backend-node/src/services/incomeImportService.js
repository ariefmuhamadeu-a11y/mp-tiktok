import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { commerceDatabasePath } from './workspaceService.js';

const text = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');

function fail(message, statusCode = 422) {
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;
}

function hash(value) {
    return createHash('sha256').update(String(value)).digest('hex');
}

function money(value) {
    const raw = text(value).replace(/\s/g, '');
    if (!raw) return null;
    const negative = raw.startsWith('-') || /^\(.*\)$/.test(raw);
    const digits = raw.replace(/[^0-9]/g, '');
    if (!digits) return null;
    const amount = Number(digits);
    return Number.isSafeInteger(amount) ? (negative ? -amount : amount) : null;
}

function date(value) {
    const raw = text(value);
    if (!raw) return null;
    const match = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
}

function contentHash(row) {
    const normalized = Object.fromEntries(Object.entries(row)
        .filter(([key]) => key !== '__sourceRow')
        .sort(([left], [right]) => left.localeCompare(right)));
    return hash(JSON.stringify(normalized));
}

function sameFinancialContent(existing, row) {
    return [
        ['settlement_amount', 'Jumlah penyelesaian pembayaran'],
        ['total_revenue', 'Total Pendapatan'],
        ['total_fees', 'Total Biaya'],
        ['refund_after_discount', 'Total pengembalian dana setelah diskon'],
        ['platform_commission', 'Biaya komisi platform'],
        ['logistics_service_fee', 'Biaya layanan logistik'],
        ['shipping_fee', 'Ongkir'],
        ['seller_discount', 'Diskon penjual']
    ].filter(([, key]) => Object.prototype.hasOwnProperty.call(row, key))
        .every(([column, key]) => Number(existing[column] ?? 0) === Number(money(row[key]) ?? 0));
}

function eventKey(type, reference, creditedOn) {
    return hash([type, reference, creditedOn || ''].join('|'));
}

function blankCounts() {
    return { rowCount: 0, importedCount: 0, duplicateCount: 0, unmatchedCount: 0, errorCount: 0 };
}

function saveImportRow(database, batchId, sheetName, sourceRow, row, result, ids = {}, message = null) {
    database.prepare(`
        INSERT INTO import_rows (
            import_batch_id, order_id, financial_transaction_id, financial_transfer_id,
            sheet_name, row_number, row_hash, result, message, raw_data, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
        batchId, ids.orderId ?? null, ids.transactionId ?? null, ids.transferId ?? null,
        sheetName, Number(sourceRow || 0), contentHash(row), result, message, JSON.stringify(row)
    );
}

function syncFinancialStatuses(database, storeId) {
    const orders = database.prepare('SELECT id FROM orders WHERE store_id = ?').all(storeId);
    const transactions = database.prepare(`
        SELECT order_id, settlement_amount, refund_after_discount, credited_on
        FROM financial_transactions
        WHERE store_id = ? AND transaction_type = 'Pesanan' AND order_id IS NOT NULL
    `).all(storeId);
    const grouped = new Map();
    transactions.forEach((transaction) => {
        const list = grouped.get(transaction.order_id) || [];
        list.push(transaction);
        grouped.set(transaction.order_id, list);
    });
    const update = database.prepare(`
        UPDATE orders SET financial_status = ?, balance_credited_on = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `);
    orders.forEach((order) => {
        const rows = grouped.get(order.id) || [];
        const net = rows.reduce((sum, row) => sum + Number(row.settlement_amount || 0), 0);
        const refunded = rows.some((row) => Number(row.refund_after_discount || 0) < 0);
        const creditedDates = rows.filter((row) => Number(row.settlement_amount || 0) > 0 && row.credited_on).map((row) => row.credited_on).sort();
        const status = net > 0 && refunded ? 'partially_refunded'
            : net > 0 ? 'credited_to_balance'
                : refunded ? 'refunded'
                    : net < 0 ? 'negative_adjustment' : rows.length ? 'zero_settlement' : 'not_reported';
        update.run(status, creditedDates.at(-1) || null, order.id);
    });
}

function saveBatch(database, storeId, fileName, payload, counts, warning, report) {
    const digest = hash(JSON.stringify({ fileName: text(fileName), details: payload.details, withdrawals: payload.withdrawals, report }));
    const existing = database.prepare('SELECT id FROM import_batches WHERE store_id = ? AND kind = ? AND file_sha256 = ?').get(storeId, 'income', digest);
    if (existing) return { id: existing.id, alreadyImported: true, digest };
    const result = database.prepare(`
        INSERT INTO import_batches (
            store_id, kind, filename, file_sha256, status, report_summary,
            warning, row_count, imported_count, duplicate_count, unmatched_count,
            error_count, imported_at, created_at, updated_at
        ) VALUES (?, 'income', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
    `).get(
        storeId, text(fileName) || 'import-keuangan.xlsx', digest,
        counts.errorCount > 0 ? 'needs_review' : 'completed', JSON.stringify(report || {}), warning,
        counts.rowCount, counts.importedCount, counts.duplicateCount, counts.unmatchedCount, counts.errorCount
    );
    return { id: result.id, alreadyImported: false, digest };
}

export function importIncomeRows({ storeId, fileName, details, withdrawals = [], report = {}, databasePath = commerceDatabasePath }) {
    const numericStoreId = Number(storeId);
    if (!Number.isInteger(numericStoreId) || numericStoreId < 1) fail('Toko tujuan tidak valid.');
    if (!existsSync(databasePath)) fail('Database impor belum tersedia.', 503);
    if (!Array.isArray(details) || !details.length) fail('Tidak ada baris Detail pesanan yang bisa diimpor.');
    if (!Array.isArray(withdrawals)) fail('Data Riwayat penarikan tidak valid.');

    const database = new DatabaseSync(databasePath);
    database.exec('PRAGMA foreign_keys = ON;');
    try {
        const store = database.prepare('SELECT id, name FROM stores WHERE id = ?').get(numericStoreId);
        if (!store) fail('Toko tujuan tidak ditemukan.', 404);
        const payload = { details, withdrawals };
        const counts = blankCounts();
        const detailSettlementTotal = details.reduce((sum, row) => sum + (money(row['Jumlah penyelesaian pembayaran']) || 0), 0);
        const reportedSettlementTotal = money(report['Jumlah penyelesaian pembayaran']);
        const warning = reportedSettlementTotal !== null && detailSettlementTotal !== reportedSettlementTotal
            ? 'Total Laporan tidak sama dengan jumlah baris Detail pesanan; data tetap diimpor untuk ditinjau.' : null;

        database.exec('BEGIN IMMEDIATE');
        try {
            const batch = saveBatch(database, store.id, fileName, payload, counts, warning, report);
            if (batch.alreadyImported) {
                database.exec('ROLLBACK');
                return { status: 'already_imported', store, batchId: batch.id, ...counts, warning: 'File yang sama sudah pernah diimpor.' };
            }

            const seenEvents = new Set();
            for (const row of details) {
                counts.rowCount += 1;
                const referenceId = text(row['ID Pesanan/Penyesuaian']);
                const transactionType = text(row['Jenis transaksi']);
                const creditedOn = date(row['Waktu pembayaran pesanan']);
                if (!referenceId || !transactionType || money(row['Jumlah penyelesaian pembayaran']) === null) {
                    counts.errorCount += 1;
                    saveImportRow(database, batch.id, 'Detail pesanan', row.__sourceRow, row, 'error', {}, 'ID, jenis transaksi, atau jumlah penyelesaian tidak valid.');
                    continue;
                }
                const key = eventKey(transactionType, referenceId, creditedOn);
                const rowHash = contentHash(row);
                const existing = database.prepare('SELECT * FROM financial_transactions WHERE store_id = ? AND event_key = ?').get(store.id, key);
                if (existing || seenEvents.has(key)) {
                    const sameContent = !existing || sameFinancialContent(existing, row);
                    if (sameContent) counts.duplicateCount += 1;
                    else counts.errorCount += 1;
                    saveImportRow(database, batch.id, 'Detail pesanan', row.__sourceRow, row, sameContent ? 'duplicate' : 'conflict', { transactionId: existing?.id }, sameContent ? null : 'Transaksi yang sama memiliki nilai berbeda.');
                    seenEvents.add(key);
                    continue;
                }

                const orderId = transactionType === 'Pesanan'
                    ? database.prepare('SELECT id FROM orders WHERE store_id = ? AND external_order_id = ?').get(store.id, referenceId)?.id ?? null
                    : null;
                const transaction = database.prepare(`
                    INSERT INTO financial_transactions (
                        store_id, order_id, event_key, content_hash, external_reference_id,
                        transaction_type, ordered_on, credited_on, currency, settlement_amount,
                        total_revenue, total_fees, refund_after_discount, platform_commission,
                        logistics_service_fee, shipping_fee, seller_discount, breakdown,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    RETURNING id
                `).get(
                    store.id, orderId, key, rowHash, referenceId, transactionType,
                    date(row['Waktu pemesanan']), creditedOn, text(row['Mata uang']) || 'IDR', money(row['Jumlah penyelesaian pembayaran']),
                    money(row['Total Pendapatan']), money(row['Total Biaya']), money(row['Total pengembalian dana setelah diskon']),
                    money(row['Biaya komisi platform']), money(row['Biaya layanan logistik']), money(row['Ongkir']), money(row['Diskon penjual']), JSON.stringify(row)
                );
                saveImportRow(database, batch.id, 'Detail pesanan', row.__sourceRow, row, orderId || transactionType !== 'Pesanan' ? 'imported' : 'unmatched', { orderId, transactionId: transaction.id });
                counts.importedCount += 1;
                if (!orderId && transactionType === 'Pesanan') counts.unmatchedCount += 1;
                seenEvents.add(key);
            }

            for (const row of withdrawals) {
                counts.rowCount += 1;
                const referenceId = text(row['ID referensi']);
                const transferType = text(row['Jenis transaksi']);
                const completedOn = date(row['Waktu keberhasilan']);
                if (!referenceId || !transferType || money(row.Total) === null) {
                    counts.errorCount += 1;
                    saveImportRow(database, batch.id, 'Riwayat penarikan', row.__sourceRow, row, 'error', {}, 'Referensi, jenis transfer, atau total tidak valid.');
                    continue;
                }
                const key = eventKey(transferType, referenceId, completedOn);
                const rowHash = contentHash(row);
                const existing = database.prepare('SELECT * FROM financial_transfers WHERE store_id = ? AND event_key = ?').get(store.id, key);
                if (existing) {
                    const sameContent = Number(existing.amount ?? 0) === Number(money(row.Total) ?? 0)
                        && text(existing.status) === text(row.Status);
                    if (sameContent) counts.duplicateCount += 1;
                    else counts.errorCount += 1;
                    saveImportRow(database, batch.id, 'Riwayat penarikan', row.__sourceRow, row, sameContent ? 'duplicate' : 'conflict', { transferId: existing.id }, sameContent ? null : 'Transfer yang sama memiliki nilai berbeda.');
                    continue;
                }
                const financialId = database.prepare('SELECT id FROM financial_transactions WHERE store_id = ? AND external_reference_id = ? ORDER BY id DESC LIMIT 1').get(store.id, referenceId)?.id ?? null;
                const transfer = database.prepare(`
                    INSERT INTO financial_transfers (
                        store_id, financial_transaction_id, event_key, content_hash, external_reference_id,
                        transfer_type, requested_on, completed_on, amount, status, bank_account,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    RETURNING id
                `).get(
                    store.id, financialId, key, rowHash, referenceId, transferType, date(row['Waktu permintaan']), completedOn,
                    money(row.Total), text(row.Status), text(row['Rekening bank']) === '/' ? null : text(row['Rekening bank'])
                );
                saveImportRow(database, batch.id, 'Riwayat penarikan', row.__sourceRow, row, 'imported', { transferId: transfer.id, transactionId: financialId });
                counts.importedCount += 1;
            }
            const batchUpdate = database.prepare('UPDATE import_batches SET status = ?, warning = ?, row_count = ?, imported_count = ?, duplicate_count = ?, unmatched_count = ?, error_count = ?, imported_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
            batchUpdate.run(counts.errorCount > 0 ? 'needs_review' : 'completed', warning, counts.rowCount, counts.importedCount, counts.duplicateCount, counts.unmatchedCount, counts.errorCount, batch.id);
            syncFinancialStatuses(database, store.id);
            database.exec('COMMIT');
            return { status: 'imported', store, batchId: batch.id, ...counts, warning, detailSettlementTotal, reportedSettlementTotal };
        } catch (error) {
            database.exec('ROLLBACK');
            throw error;
        }
    } finally {
        database.close();
    }
}
