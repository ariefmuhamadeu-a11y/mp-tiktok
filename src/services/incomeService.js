import * as XLSX from 'xlsx';

export const incomeText = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
export const incomeNormalize = (value) => incomeText(value)
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
export const escapeIncomeHtml = (value) => incomeText(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[character]));

const detailRequiredHeaders = [
    'ID Pesanan/Penyesuaian',
    'Jenis transaksi',
    'Waktu pembayaran pesanan',
    'Jumlah penyelesaian pembayaran'
];

const detailPreviewHeaders = [
    'ID Pesanan/Penyesuaian',
    'Jenis transaksi',
    'Waktu pemesanan',
    'Waktu pembayaran pesanan',
    'Jumlah penyelesaian pembayaran',
    'Total Pendapatan',
    'Total Biaya'
];

const toSheetRows = (sheet) => XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false
});

function sheetByName(workbook, expectedName) {
    const normalized = incomeNormalize(expectedName);
    const name = workbook.SheetNames.find((candidate) => incomeNormalize(candidate) === normalized);
    return name ? workbook.Sheets[name] : null;
}

function findHeaderRow(rows, requiredHeaders) {
    const required = new Set(requiredHeaders.map(incomeNormalize));
    let best = { index: -1, headers: [], score: 0 };
    rows.slice(0, 20).forEach((row, index) => {
        const headers = (row || []).map(incomeText);
        const score = headers.filter((value) => required.has(incomeNormalize(value))).length;
        if (score > best.score) best = { index, headers, score };
    });
    return best;
}

function rowsToObjects(rows, headerInfo) {
    if (headerInfo.index < 0) return [];
    return rows.slice(headerInfo.index + 1).map((values, offset) => {
        const row = {};
        headerInfo.headers.forEach((header, index) => {
            if (header) row[header] = incomeText(values?.[index]);
        });
        return { row, sourceRow: headerInfo.index + offset + 2 };
    }).filter(({ row }) => Object.values(row).some((value) => incomeText(value)));
}

function reportValues(rows) {
    const result = {};
    rows.forEach((row) => {
        const values = (row || []).map(incomeText).filter(Boolean);
        for (let index = 0; index < values.length - 1; index += 1) {
            const key = values[index];
            const value = values[index + 1];
            if (key.length > 1 && (value !== key || /^-?\d/.test(value))) result[key] = value;
        }
    });
    return result;
}

export function incomeMoney(value) {
    const raw = incomeText(value).replace(/\s/g, '');
    if (!raw) return null;
    const negative = /^-/.test(raw) || /^\(.*\)$/.test(raw);
    const digits = raw.replace(/[^0-9]/g, '');
    if (!digits) return null;
    const amount = Number(digits);
    return Number.isFinite(amount) ? (negative ? -amount : amount) : null;
}

export function formatIncomeAmount(value) {
    const amount = incomeMoney(value);
    if (amount === null) return '—';
    return (amount < 0 ? '-Rp' : 'Rp') + Math.abs(amount).toLocaleString('id-ID');
}

function eventKey(row) {
    return [row['Jenis transaksi'], row['ID Pesanan/Penyesuaian'], row['Waktu pembayaran pesanan']]
        .map(incomeText).join('|');
}

function auditWorkbook({ workbook, details, withdrawals, report, headerInfo }) {
    const missingHeaders = detailRequiredHeaders.filter((header) => !headerInfo.headers.some((value) => incomeNormalize(value) === incomeNormalize(header)));
    const invalidRows = details.filter(({ row }) => !incomeText(row['ID Pesanan/Penyesuaian']) || !incomeText(row['Jenis transaksi']) || incomeMoney(row['Jumlah penyelesaian pembayaran']) === null);
    const keys = new Set();
    const duplicateRows = details.filter(({ row }) => {
        const key = eventKey(row);
        if (!key || keys.has(key)) return Boolean(key);
        keys.add(key);
        return false;
    });
    const detailSettlementTotal = details.reduce((sum, { row }) => sum + (incomeMoney(row['Jumlah penyelesaian pembayaran']) || 0), 0);
    const reportedSettlementTotal = incomeMoney(report['Jumlah penyelesaian pembayaran']);
    const settlementDelta = reportedSettlementTotal === null ? null : detailSettlementTotal - reportedSettlementTotal;
    const hasDetailSheet = Boolean(sheetByName(workbook, 'Detail pesanan'));
    const hasReportSheet = Boolean(sheetByName(workbook, 'Laporan'));
    const hasWithdrawalSheet = Boolean(sheetByName(workbook, 'Riwayat penarikan'));

    return {
        sheetNames: workbook.SheetNames,
        detailRows: details.length,
        orderRows: details.filter(({ row }) => row['Jenis transaksi'] === 'Pesanan').length,
        adjustmentRows: details.filter(({ row }) => row['Jenis transaksi'] !== 'Pesanan').length,
        withdrawalRows: withdrawals.length,
        invalidRows: invalidRows.length,
        duplicateRows: duplicateRows.length,
        detailSettlementTotal,
        reportedSettlementTotal,
        settlementDelta,
        checks: [
            { label: 'Sheet wajib tersedia', detail: hasDetailSheet && hasReportSheet ? 'Detail pesanan dan Laporan ditemukan' : 'Sheet wajib belum lengkap', status: hasDetailSheet && hasReportSheet ? 'ok' : 'error' },
            { label: 'Kolom inti', detail: missingHeaders.length ? 'Kurang: ' + missingHeaders.join(', ') : 'Semua kolom inti ditemukan', status: missingHeaders.length ? 'error' : 'ok' },
            { label: 'Baris valid', detail: invalidRows.length ? invalidRows.length + ' baris perlu diperiksa' : details.length + ' baris siap diproses', status: invalidRows.length ? 'error' : 'ok' },
            { label: 'Duplikat event', detail: duplicateRows.length ? duplicateRows.length + ' baris terdeteksi duplikat' : 'Tidak ada duplikat event dalam file', status: duplicateRows.length ? 'warning' : 'ok' },
            { label: 'Rekonsiliasi total', detail: reportedSettlementTotal === null ? 'Total Laporan tidak tersedia' : (settlementDelta === 0 ? 'Detail sama dengan Laporan' : 'Selisih ' + formatIncomeAmount(settlementDelta)), status: reportedSettlementTotal === null ? 'warning' : settlementDelta === 0 ? 'ok' : 'warning' },
            { label: 'Riwayat penarikan', detail: hasWithdrawalSheet ? withdrawals.length + ' transfer ditemukan' : 'Sheet tidak tersedia', status: hasWithdrawalSheet ? 'ok' : 'warning' }
        ],
        ready: !missingHeaders.length && !invalidRows.length && details.length > 0,
        report
    };
}

export async function parseIncomeFile(file) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false });
    const detailSheet = sheetByName(workbook, 'Detail pesanan');
    const reportSheet = sheetByName(workbook, 'Laporan');
    const withdrawalSheet = sheetByName(workbook, 'Riwayat penarikan');
    if (!detailSheet) throw new Error('Sheet "Detail pesanan" tidak ditemukan.');

    const detailRows = toSheetRows(detailSheet);
    const headerInfo = findHeaderRow(detailRows, detailRequiredHeaders);
    if (headerInfo.index < 0) throw new Error('Header Detail pesanan tidak ditemukan.');
    const details = rowsToObjects(detailRows, headerInfo);
    const withdrawals = withdrawalSheet ? rowsToObjects(toSheetRows(withdrawalSheet), findHeaderRow(toSheetRows(withdrawalSheet), ['Jenis transaksi', 'ID referensi', 'Total'])) : [];
    const report = reportSheet ? reportValues(toSheetRows(reportSheet)) : {};
    const audit = auditWorkbook({ workbook, details, withdrawals, report, headerInfo });
    return {
        fileName: file.name,
        details: details.map(({ row, sourceRow }) => ({ ...row, __sourceRow: sourceRow })),
        withdrawals: withdrawals.map(({ row, sourceRow }) => ({ ...row, __sourceRow: sourceRow })),
        report,
        previewHeaders: detailPreviewHeaders,
        previewRows: details.slice(0, 100).map(({ row, sourceRow }) => ({ row, sourceRow })),
        audit
    };
}
