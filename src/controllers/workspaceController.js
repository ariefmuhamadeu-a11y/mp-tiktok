import { escapeShipmentHtml as escapeHtml } from '../services/shipmentService.js';
import { initDatePickers } from '../services/datePickerService.js';

const element = (id) => document.getElementById(id);
const financeTabStorageKey = 'mp-tiktok.financeTab';
const financeTabs = new Set(['overview', 'ads', 'ledger', 'shipment', 'transfer']);
const storedFinanceTab = (() => {
    try {
        const value = window.localStorage.getItem(financeTabStorageKey);
        return financeTabs.has(value) ? value : 'overview';
    } catch {
        return 'overview';
    }
})();
const ordersTabStorageKey = 'mp-tiktok.ordersTab';
const ordersTabs = new Set(['overview', 'all', 'products', 'discounts', 'status']);
const storedOrdersTab = (() => {
    try {
        const value = window.localStorage.getItem(ordersTabStorageKey);
        return ordersTabs.has(value) ? value : 'overview';
    } catch {
        return 'overview';
    }
})();
const ordersCompareModeStorageKey = 'mp-tiktok.ordersCompareMode';
const ordersCompareModes = new Set(['previous', 'none']);
const storedOrdersCompareMode = (() => {
    try {
        const value = window.localStorage.getItem(ordersCompareModeStorageKey);
        return ordersCompareModes.has(value) ? value : 'previous';
    } catch {
        return 'previous';
    }
})();
const shippingTabStorageKey = 'mp-tiktok.shippingTab';
const shippingTabs = new Set(['overview', 'pending', 'in-transit', 'completed', 'failed', 'all']);
const storedShippingTab = (() => {
    try {
        const value = window.localStorage.getItem(shippingTabStorageKey);
        return shippingTabs.has(value) ? value : 'overview';
    } catch {
        return 'overview';
    }
})();
const state = { data: null, search: '', shippingSearch: '', financeSearch: '', financeDateRange: { start: '', end: '' }, ordersDateRange: { start: '', end: '' }, shippingDateRange: { start: '', end: '' }, financeTab: storedFinanceTab, financeTypeFilter: 'Pesanan', ordersTab: storedOrdersTab, ordersCompareMode: storedOrdersCompareMode, shippingTab: storedShippingTab };
const indonesiaTimeZone = 'Asia/Jakarta';
const indonesiaDateFormatter = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: indonesiaTimeZone });
const indonesiaMonthFormatter = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: indonesiaTimeZone });
const indonesiaDateKeyFormatter = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: indonesiaTimeZone });
const count = (value) => Number(value || 0).toLocaleString('id-ID');
const money = (value) => 'Rp' + Math.abs(Number(value || 0)).toLocaleString('id-ID');
const signedMoney = (value) => {
    const amount = Number(value || 0);
    return (amount < 0 ? '-Rp' : 'Rp') + Math.abs(amount).toLocaleString('id-ID');
};
const safe = (value) => escapeHtml(value || '—');
const displayTransactionType = (value) => ({
    Pesanan: 'Pesanan',
    'Pembayaran GMV untuk Iklan TikTok': 'Biaya iklan TikTok'
}[value] || value || 'Jenis lain');

function parseIndonesiaDate(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
    const isoWithoutZone = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2})(?::?(\d{2}))?(?::?(\d{2}))?)?$/);
    if (isoWithoutZone && !hasExplicitZone) {
        const [, year, month, day, hour = '00', minute = '00', second = '00'] = isoWithoutZone;
        return new Date(year + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0') + 'T' + hour.padStart(2, '0') + ':' + minute.padStart(2, '0') + ':' + second.padStart(2, '0') + '+07:00');
    }
    const dmy = raw.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})(?:[ T](\d{1,2})(?::?(\d{2}))?(?::?(\d{2}))?)?$/);
    if (dmy) {
        const [, day, month, year, hour = '00', minute = '00', second = '00'] = dmy;
        return new Date(year + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0') + 'T' + hour.padStart(2, '0') + ':' + minute.padStart(2, '0') + ':' + second.padStart(2, '0') + '+07:00');
    }
    const parsed = new Date(raw.replace(' ', 'T'));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateLabel(value) {
    if (!value) return '—';
    const date = parseIndonesiaDate(value);
    return !date || Number.isNaN(date.getTime()) ? safe(value) : indonesiaDateFormatter.format(date);
}

function dateKey(value) {
    const date = value instanceof Date ? value : parseIndonesiaDate(value);
    return !date || Number.isNaN(date.getTime()) ? '' : indonesiaDateKeyFormatter.format(date);
}

function shiftDateKey(value, days) {
    const [year, month, day] = String(value || '').split('-').map(Number);
    if (!year || !month || !day) return '';
    const shifted = new Date(Date.UTC(year, month - 1, day));
    shifted.setUTCDate(shifted.getUTCDate() + days);
    return shifted.toISOString().slice(0, 10);
}

function previousDateRange(range) {
    if (!range?.start || !range?.end) return null;
    const start = new Date(range.start + 'T00:00:00Z');
    const end = new Date(range.end + 'T00:00:00Z');
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
    const dayCount = Math.round((end - start) / 86400000) + 1;
    const comparisonEnd = shiftDateKey(range.start, -1);
    return { start: shiftDateKey(comparisonEnd, -(dayCount - 1)), end: comparisonEnd, dayCount };
}

function defaultCurrentMonthDateRange() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: indonesiaTimeZone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date()).filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]));
    const start = `${parts.year}-${parts.month}-01`;
    const end = `${parts.year}-${parts.month}-${parts.day}`;
    return { start, end };
}

function dateKeysFromFlatpickrValue(value) {
    const monthNumbers = {
        Jan: 0, Januari: 0,
        Feb: 1, Februari: 1,
        Mar: 2, Maret: 2,
        Apr: 3, April: 3,
        Mei: 4,
        Jun: 5, Juni: 5,
        Jul: 6, Juli: 6,
        Agu: 7, Agustus: 7,
        Sep: 8, September: 8,
        Okt: 9, Oktober: 9,
        Nov: 10, November: 10,
        Des: 11, Desember: 11
    };
    return Array.from(String(value || '').matchAll(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/g))
        .map(([, day, month, year]) => {
            const monthNumber = monthNumbers[month];
            if (monthNumber === undefined) return '';
            return dateKey(new Date(Number(year), monthNumber, Number(day)));
        })
        .filter(Boolean);
}

function financeDateMatches(value) {
    const { start, end } = state.financeDateRange;
    if (!start && !end) return true;
    const key = dateKey(value);
    return Boolean(key) && (!start || key >= start) && (!end || key <= end);
}

function financeUploadDateRanges(dateValues) {
    const grouped = new Map();
    dateValues.forEach((dateValue) => {
        const match = String(dateValue || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return;
        const monthKey = match[1] + '-' + match[2];
        const day = Number(match[3]);
        const days = grouped.get(monthKey) || [];
        if (!days.includes(day)) days.push(day);
        grouped.set(monthKey, days);
    });
    return Array.from(grouped.entries())
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([monthKey, days]) => {
            days.sort((a, b) => a - b);
            const ranges = [];
            let start = days[0];
            let previous = days[0];
            days.slice(1).forEach((day) => {
                if (day === previous + 1) {
                    previous = day;
                    return;
                }
                ranges.push(start === previous ? String(start) : start + '–' + previous);
                start = day;
                previous = day;
            });
            if (days.length) ranges.push(start === previous ? String(start) : start + '–' + previous);
            const monthDate = parseIndonesiaDate(monthKey + '-01');
            const monthLabel = !monthDate || Number.isNaN(monthDate.getTime())
                ? monthKey
                : indonesiaMonthFormatter.format(monthDate);
            return '<strong>' + safe(monthLabel) + ': ' + safe(ranges.join(', ')) + '</strong>';
        });
}

function kpi(label, value, hint, icon) {
    return '<article class="workspace-kpi"><div class="label"><span>' + label + '</span><i class="bi ' + icon + '"></i></div>' +
        '<div class="value">' + value + '</div><div class="hint">' + hint + '</div></article>';
}

function ordersMetricCell(value) {
    return '<td class="numeric-cell orders-value-cell"><span class="orders-current-line"><strong>' + money(value) + '</strong></span></td>';
}

function ordersAverageCell(value, orderCount) {
    const currentAverage = orderCount ? Math.round(Number(value || 0) / orderCount) : 0;
    return '<td class="numeric-cell orders-average-cell"><span class="orders-current-line"><strong>' + (currentAverage ? money(currentAverage) : '—') + '</strong></span></td>';
}

function ordersCountCell(value) {
    return '<td class="orders-count-value"><span class="orders-current-line"><strong>' + count(value) + '</strong></span></td>';
}

function ordersKpiComparison(current, previous, formatter) {
    if (!previous && !current) return '<small class="orders-kpi-comparison"><span class="orders-kpi-previous">—</span></small>';
    return '<small class="orders-kpi-comparison"><span class="orders-kpi-previous">vs ' + formatter(previous) + '</span>' + comparisonMarkup(Number(current || 0), Number(previous || 0)) + '</small>';
}

function financeBadge(status) {
    return status === 'credited_to_balance'
        ? '<span class="workspace-badge success">Masuk saldo</span>'
        : '<span class="workspace-badge warning">Belum dilaporkan</span>';
}

function shippingBadge(order) {
    if (order.deliveredAt) return '<span class="workspace-badge success">Terkirim</span>';
    if (order.shippedAt) return '<span class="workspace-badge">Dalam pengiriman</span>';
    return '<span class="workspace-badge">' + safe(order.status) + '</span>';
}

function ledgerAmount(value) {
    return value === null || value === undefined || value === '' ? '—' : signedMoney(value);
}

function transactionGrossSales(transaction) {
    const revenue = Number(transaction.totalRevenue || 0);
    return revenue + Math.abs(Number(transaction.sellerDiscount || 0));
}

function transactionNetSales(transaction) {
    return Number(transaction.totalRevenue || 0) - Math.abs(Number(transaction.refundAfterDiscount || 0));
}

function transactionBadge(transaction) {
    if (transaction.transactionType === 'Pesanan' && transaction.orderId) {
        return transaction.financialStatus === 'credited_to_balance'
            ? '<span class="workspace-badge success">Cocok</span>'
            : '<span class="workspace-badge warning">Menunggu dana</span>';
    }
    if (transaction.transactionType === 'Pesanan') return '<span class="workspace-badge warning">Belum ada di data kirim</span>';
    if (transaction.orderId) return '<span class="workspace-badge">Terkait pesanan</span>';
    return '<span class="workspace-badge">Penyesuaian</span>';
}

function transactionShippingBadge(transaction) {
    if (!transaction.orderId) {
        return transaction.transactionType === 'Pesanan'
            ? '<span class="workspace-badge warning">Belum ada di data kirim</span>'
            : '<span class="workspace-badge">Non-order</span>';
    }
    const labels = {
        delivered: ['success', 'Terkirim'],
        in_transit: ['', 'Dalam pengiriman'],
        awaiting_shipment: ['warning', 'Belum dikirim'],
        not_found: ['warning', 'Belum ada paket']
    };
    const [tone, label] = labels[transaction.shippingStatus] || labels.not_found;
    return '<span class="workspace-badge ' + tone + '">' + label + '</span>';
}

function transactionReferenceCell(transaction) {
    const orderReference = transaction.orderId
        ? 'Pesanan ' + safe(transaction.orderId)
        : transaction.transactionType === 'Pesanan'
            ? 'Pesanan belum terhubung'
            : 'Penyesuaian di luar pesanan';
    const shipmentReference = transaction.tracking
        ? 'Resi ' + safe(transaction.tracking) + (transaction.courier ? ' · ' + safe(transaction.courier) : '')
        : 'Resi belum tersedia';
    return '<td><strong>' + safe(transaction.externalReferenceId) + '</strong>' +
        '<span class="muted-line">' + orderReference + '</span>' +
        '<span class="muted-line">' + shipmentReference + '</span>' +
        '<span class="muted-line finance-reference-status">' + transactionShippingBadge(transaction) + ' ' + transactionBadge(transaction) + '</span></td>';
}

function financeOrderDetails(orders) {
    const details = new Map();
    (orders || []).forEach((order) => {
        const key = String(order.orderId || '');
        if (!key) return;
        const current = details.get(key) || { items: [], quantity: 0 };
        const itemName = [order.product, order.variant].filter((value) => String(value || '').trim()).join(' · ') || 'Item pesanan';
        if (!current.items.includes(itemName)) current.items.push(itemName);
        current.quantity += Number(order.quantity || 0);
        details.set(key, current);
    });
    return details;
}

function transactionItemsCells(transaction, orderDetails) {
    const key = String(transaction.orderId || transaction.externalReferenceId || '');
    const detail = orderDetails.get(key);
    if (!detail) {
        return '<td class="finance-item-cell"><span class="muted-line">Item belum tersedia</span></td><td class="numeric-cell finance-qty-cell">—</td>';
    }
    return '<td class="finance-item-cell">' + detail.items.map((item) => '<span class="finance-item-line" title="' + safe(item) + '">' + safe(item) + '</span>').join('') + '</td>' +
        '<td class="numeric-cell finance-qty-cell">' + count(detail.quantity) + '</td>';
}

function percentage(value, base) {
    const denominator = Math.abs(Number(base || 0));
    if (!denominator) return null;
    return ((Math.abs(Number(value || 0)) / denominator) * 100).toLocaleString('id-ID', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }) + '%';
}

const otherFeeKeys = new Set([
    'Biaya Pembayaran',
    'Credit card installment - Handling fee',
    'Biaya layanan pre-order',
    'Biaya layanan Mall',
    'Komisi Afiliasi',
    'Komisi mitra afiliasi',
    'Komisi Iklan Toko afiliasi',
    'Deposit komisi afiliasi',
    'Pengembalian dana komisi afiliasi',
    'Komisi iklan toko Mitra Afiliasi',
    'Biaya layanan Program Bebas Ongkir',
    'Komisi dinamis',
    'Biaya layanan Program Growth Xtra',
    'Biaya layanan Khusus LIVE',
    'Biaya layanan Growth Xtra Program Super',
    'Biaya pemrosesan pesanan',
    'Biaya layanan Program EAMS',
    'Biaya layanan Brands Crazy Deal/Flash Sale',
    'Biaya Dilayani Tokopedia',
    'Biaya penanganan Dilayani Tokopedia',
    'Biaya program PayLater',
    'Biaya sumber daya campaign',
    'Biaya layanan penginstalan',
    'PPh Pasal 22 dipungut',
    'Biaya layanan khusus platform',
    'Biaya iklan GMV Max',
    'Pajak penjualan atas voucher GMV Max',
    'Program layanan terkelola (Pajak penjualan)',
    'Program layanan terkelola (Biaya per pesanan)',
    'Ongkir pesanan gagal kirim',
    'Ongkir pengembalian barang karena kesalahan pembeli',
    'Insurance fee'
]);

function transactionBreakdown(transaction) {
    try {
        return JSON.parse(transaction.breakdown || '{}');
    } catch {
        return {};
    }
}

function otherFeeDetails(transaction) {
    return Object.entries(transactionBreakdown(transaction))
        .filter(([label, value]) => otherFeeKeys.has(label) && Math.abs(Number(value || 0)) > 0)
        .map(([label, value]) => [label, Math.abs(Number(value || 0))]);
}

function transactionFinanceCell(transaction, compact = false) {
    const gross = transactionGrossSales(transaction);
    const net = transactionNetSales(transaction);
    const rateLabel = (value) => percentage(value, gross) || 'Tidak ada penjualan';
    const line = (label, value, tone = '', rate = '') => '<span class="finance-summary-line"><small>' + label + '</small><strong class="' + tone + '">' + ledgerAmount(value) + (rate ? ' <em>' + rate + '</em>' : '') + '</strong></span>';
    if (compact) {
        return '<td class="numeric-cell finance-summary-cell"><div class="finance-summary-list">' + line('Bersih', net, 'settlement-value') + '</div></td>';
    }
    return '<td class="numeric-cell finance-summary-cell"><div class="finance-summary-list">' +
        line('Kotor', gross) +
        line('Bersih', net, '', rateLabel(net)) +
        line('Biaya', transaction.totalFees, 'negative-value', percentage(transaction.totalFees, gross) || 'Tidak ada penjualan') +
        line('Penghasilan', transaction.settlementAmount, 'settlement-value', rateLabel(transaction.settlementAmount)) +
        '</div></td>';
}

function transactionFeeDetailsCell(transaction) {
    const details = [
        ['Komisi platform', transaction.platformCommission],
        ['Layanan logistik', transaction.logisticsServiceFee],
        ['Ongkir', transaction.shippingFee],
        ...otherFeeDetails(transaction)
    ].filter(([, value]) => Math.abs(Number(value || 0)) > 0);
    const listedTotal = details.reduce((total, [, value]) => total + Math.abs(Number(value || 0)), 0);
    const remaining = Math.max(Math.abs(Number(transaction.totalFees || 0)) - listedTotal, 0);
    if (remaining > 0) details.push(['Biaya lainnya', remaining]);
    const sales = Math.abs(Number(transaction.totalRevenue || 0));
    const detailLines = details.map(([label, value]) => '<span class="finance-fee-detail-line"><small>' + safe(label) + '</small><strong>' + money(value) + (percentage(value, sales) ? ' <em>' + percentage(value, sales) + '</em>' : '') + '</strong></span>').join('');
    return '<td class="finance-fee-detail-cell">' +
        '<div class="finance-fee-detail-list finance-fee-detail-list-standalone">' + (detailLines || '<span class="muted-line">Tidak ada rincian biaya</span>') + '</div>' +
        '</td>';
}

function transactionSummaryDate(transaction) {
    return transaction.orderedOn || transaction.creditedOn || transaction.shippedAt || transaction.deliveredAt || '';
}

function isFailedShipment(order) {
    const status = String(order.status || '').toLowerCase();
    return status.includes('gagal') || status.includes('failed') || status.includes('cancel') || status.includes('batal');
}

function transactionDateCell(transaction, storeName = '') {
    const dateLine = (label, value) => '<span><small>' + label + '</small><strong>' + dateLabel(value) + '</strong></span>';
    return '<td class="finance-date-cell">' +
        '<div class="finance-date-layout"><div class="finance-date-main">' +
            dateLine('Masuk saldo', transaction.creditedOn) +
            dateLine('Diterima', transaction.deliveredAt) +
        '</div><div class="finance-date-side">' +
            dateLine('Order', transaction.orderedOn) +
            dateLine('Dikirim', transaction.shippedAt) +
        '</div></div>' +
        '<span class="finance-date-type">' + safe(displayTransactionType(transaction.transactionType)) + '</span>' +
        (storeName ? '<span class="finance-date-store"><small>Toko</small><strong title="' + safe(storeName) + '">' + safe(storeName) + '</strong></span>' : '') +
    '</td>';
}

function setFinanceTab(tab = state.financeTab) {
    state.financeTab = financeTabs.has(tab) ? tab : 'overview';
    try {
        window.localStorage.setItem(financeTabStorageKey, state.financeTab);
    } catch {
        // Storage can be unavailable in a restricted browser context.
    }
    document.querySelectorAll('[data-finance-tab]').forEach((button) => {
        const active = button.dataset.financeTab === state.financeTab;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('[data-finance-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.financePanel !== state.financeTab;
    });
}

function setOrdersTab(tab = state.ordersTab) {
    state.ordersTab = ordersTabs.has(tab) ? tab : 'overview';
    try {
        window.localStorage.setItem(ordersTabStorageKey, state.ordersTab);
    } catch {
        // Storage can be unavailable in a restricted browser context.
    }
    document.querySelectorAll('[data-orders-tab]').forEach((button) => {
        const active = button.dataset.ordersTab === state.ordersTab;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('[data-orders-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.ordersPanel !== state.ordersTab;
    });
}

function setShippingTab(tab = state.shippingTab) {
    state.shippingTab = shippingTabs.has(tab) ? tab : 'overview';
    try {
        window.localStorage.setItem(shippingTabStorageKey, state.shippingTab);
    } catch {
        // Storage can be unavailable in a restricted browser context.
    }
    document.querySelectorAll('[data-shipping-tab]').forEach((button) => {
        const active = button.dataset.shippingTab === state.shippingTab;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('[data-shipping-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.shippingPanel === 'overview'
            ? state.shippingTab !== 'overview'
            : state.shippingTab === 'overview';
    });
    const activeShippingButton = document.querySelector('[data-shipping-tab="' + (state.shippingTab === 'overview' ? 'all' : state.shippingTab) + '"]');
    const shippingControlPanel = document.querySelector('[data-shipping-panel="control"]');
    if (activeShippingButton && shippingControlPanel) shippingControlPanel.setAttribute('aria-labelledby', activeShippingButton.id);
    if (state.data) renderShipping(state.data);
}

function renderDashboard(data) {
    const summary = data.summary;
    element('dashboardKpis').innerHTML = [
        kpi('Total pesanan', count(summary.total_orders), 'Order unik di toko ini', 'bi-bag-check'),
        kpi('Paket diterima', count(summary.delivered_packages), count(summary.shipped_packages) + ' paket sudah dikirim', 'bi-truck'),
        kpi('Dana masuk saldo', count(summary.credited_orders), 'Order cocok dengan laporan keuangan', 'bi-wallet2'),
        kpi('Belum dilaporkan', count(summary.pending_orders), 'Order belum ada di laporan keuangan', 'bi-hourglass-split')
    ].join('');

    element('dashboardOrderRows').innerHTML = data.orders.slice(0, 6).map((order) =>
        '<tr><td><strong>' + safe(order.orderId) + '</strong><span class="muted-line">' + dateLabel(order.createdAt) + '</span></td>' +
        '<td class="product-cell"><strong>' + safe(order.product) + '</strong><small>' + safe(order.variant) + ' · ' + safe(order.sellerSku || order.skuId) + '</small></td>' +
        '<td>' + shippingBadge(order) + '</td><td>' + financeBadge(order.financialStatus) + '</td></tr>'
    ).join('') || '<tr><td colspan="4" class="workspace-empty">Belum ada pesanan untuk toko ini.</td></tr>';

    element('dashboardImportRows').innerHTML = data.imports.map((batch) =>
        '<tr><td><strong>' + safe(batch.filename) + '</strong></td><td>' + (batch.kind === 'shipment' ? 'Pengiriman' : 'Pencairan') +
        '</td><td>' + count(batch.rowCount) + '</td><td>' + count(batch.duplicateCount) + '</td><td>' + dateLabel(batch.importedAt) + '</td></tr>'
    ).join('') || '<tr><td colspan="5" class="workspace-empty">Belum ada file yang diimpor ke database.</td></tr>';
}

function filterOrders(orders, query, dateRange) {
    const { start, end } = dateRange;
    return orders.filter((order) => {
        const matchesQuery = [order.orderId, order.product, order.variant, order.sellerSku, order.skuId, order.tracking, order.courier]
            .some((value) => String(value || '').toLowerCase().includes(query));
        if (!matchesQuery) return false;
        const orderDate = dateKey(order.createdAt);
        if (start && (!orderDate || orderDate < start)) return false;
        if (end && (!orderDate || orderDate > end)) return false;
        return true;
    });
}

function filterShippingOrders(orders, query, dateRange) {
    const { start, end } = dateRange;
    return orders.filter((order) => {
        const matchesQuery = [order.orderId, order.product, order.variant, order.sellerSku, order.skuId, order.tracking, order.courier]
            .some((value) => String(value || '').toLowerCase().includes(query));
        if (!matchesQuery) return false;
        const shippedDate = dateKey(order.shippedAt);
        if (start && (!shippedDate || shippedDate < start)) return false;
        if (end && (!shippedDate || shippedDate > end)) return false;
        return true;
    });
}

function buildOrderGroups(visible) {
    const groups = new Map();
    visible.forEach((order, index) => {
        const key = String(order.orderId || 'item-' + index);
        const current = groups.get(key) || {
            orderId: order.orderId || key,
            createdAt: order.createdAt || '',
            amount: Number(order.amount || 0),
            financialStatus: order.financialStatus,
            status: order.status,
            shippedAt: order.shippedAt || '',
            deliveredAt: order.deliveredAt || '',
            tracking: order.tracking || '',
            courier: order.courier || '',
            grossAmount: 0,
            netAmount: 0,
            sellerDiscount: 0,
            platformDiscount: 0,
            paymentPlatformDiscount: Number(order.paymentPlatformDiscount || 0),
            hasDetailedAmounts: false,
            itemCount: 0,
            products: [],
            items: []
        };
        current.itemCount += Number(order.quantity || 0);
        if (order.subtotalBeforeDiscount !== null && order.subtotalBeforeDiscount !== undefined) {
            current.grossAmount += Number(order.subtotalBeforeDiscount || 0);
            current.netAmount += Number(order.subtotalAfterDiscount ?? order.subtotalBeforeDiscount ?? 0);
            current.hasDetailedAmounts = true;
        }
        current.sellerDiscount += Math.abs(Number(order.sellerDiscount || 0));
        current.platformDiscount += Math.abs(Number(order.platformDiscount || 0));
        current.shippedAt = current.shippedAt || order.shippedAt || '';
        current.deliveredAt = current.deliveredAt || order.deliveredAt || '';
        current.tracking = current.tracking || order.tracking || '';
        current.courier = current.courier || order.courier || '';
        const productLabel = [order.product, order.variant].filter((value) => String(value || '').trim()).join(' · ');
        if (productLabel && !current.products.includes(productLabel)) current.products.push(productLabel);
        current.items.push({
            label: productLabel || 'Item pesanan',
            sku: order.sellerSku || order.skuId || '',
            quantity: Number(order.quantity || 0)
        });
        groups.set(key, current);
    });
    const orderGroups = Array.from(groups.values());
    orderGroups.forEach((order) => {
        if (!order.hasDetailedAmounts) {
            order.grossAmount = order.amount;
            order.netAmount = order.amount;
        }
    });
    return orderGroups;
}

function comparisonMarkup(current, previous) {
    if (!previous) return '<span class="orders-trend muted">—</span>';
    const delta = current - previous;
    const percentage = previous ? Math.abs(delta / previous * 100) : 0;
    if (!delta) return '<span class="orders-trend flat"><i class="bi bi-dash"></i> 0%</span>';
    const direction = delta > 0 ? 'up' : 'down';
    const icon = delta > 0 ? 'arrow-up-right' : 'arrow-down-right';
    return '<span class="orders-trend ' + direction + '"><i class="bi bi-' + icon + '"></i> ' + percentage.toFixed(1).replace('.', ',') + '%</span>';
}

function buildDailyOrderMetrics(orderGroups) {
    const daily = new Map();
    orderGroups.forEach((order) => {
        const key = order.createdAt ? String(order.createdAt).slice(0, 10) : 'tanpa-tanggal';
        const row = daily.get(key) || { orders: 0, items: 0, gross: 0, sellerDiscount: 0, platformDiscount: 0, paymentDiscount: 0, totalDiscount: 0, orderAmount: 0, net: 0 };
        row.orders += 1;
        row.items += order.itemCount;
        row.gross += order.grossAmount;
        row.sellerDiscount += order.sellerDiscount;
        row.platformDiscount += order.platformDiscount;
        row.paymentDiscount += order.paymentPlatformDiscount;
        row.totalDiscount += order.sellerDiscount + order.platformDiscount + order.paymentPlatformDiscount;
        row.orderAmount += order.amount;
        row.net += order.netAmount;
        daily.set(key, row);
    });
    return daily;
}

function renderOrderAnalysis(orderGroups, visible) {
    const products = new Map();
    visible.forEach((order, index) => {
        const productLabel = [order.product, order.variant].filter((value) => String(value || '').trim()).join(' · ') || 'Item pesanan';
        const key = String(order.sellerSku || order.skuId || productLabel || 'item-' + index);
        const current = products.get(key) || { sku: order.sellerSku || order.skuId || '—', product: productLabel, orderIds: new Set(), quantity: 0, gross: 0, net: 0 };
        current.orderIds.add(String(order.orderId || 'item-' + index));
        current.quantity += Number(order.quantity || 0);
        current.gross += Number(order.subtotalBeforeDiscount ?? order.amount ?? 0);
        current.net += Number(order.subtotalAfterDiscount ?? order.subtotalBeforeDiscount ?? order.amount ?? 0);
        products.set(key, current);
    });
    const productRows = Array.from(products.values()).sort((a, b) => b.net - a.net);
    element('ordersProductRows').innerHTML = productRows.map((product) => {
        const orderCount = product.orderIds.size;
        return '<tr><td><strong>' + safe(product.sku) + '</strong></td>' +
            '<td class="product-cell">' + safe(product.product) + '</td>' +
            '<td class="numeric-cell">' + count(orderCount) + '</td>' +
            '<td class="numeric-cell">' + count(product.quantity) + '</td>' +
            '<td class="numeric-cell">' + money(product.gross) + '</td>' +
            '<td class="numeric-cell">' + money(product.net) + '</td>' +
            '<td class="numeric-cell">' + money(orderCount ? Math.round(product.net / orderCount) : 0) + '</td></tr>';
    }).join('') || '<tr><td colspan="7" class="workspace-empty">Belum ada data produk/SKU.</td></tr>';
    element('ordersProductCount').textContent = count(productRows.length) + ' SKU ditampilkan';

    const discountTotals = [
        ['Diskon penjual', orderGroups.reduce((total, order) => total + order.sellerDiscount, 0)],
        ['Diskon platform', orderGroups.reduce((total, order) => total + order.platformDiscount, 0)],
        ['Diskon pembayaran', orderGroups.reduce((total, order) => total + order.paymentPlatformDiscount, 0)]
    ];
    const totalDiscount = discountTotals.reduce((total, [, value]) => total + value, 0);
    element('ordersDiscountKpis').innerHTML = discountTotals.map(([label, value]) =>
        '<article class="workspace-kpi"><div class="label"><span>' + label + '</span><i class="bi bi-tag"></i></div><div class="value">' + money(value) + '</div><div class="hint">' + (totalDiscount ? Math.round(value / totalDiscount * 100) : 0) + '% dari total diskon</div></article>'
    ).join('') + '<article class="workspace-kpi"><div class="label"><span>Total diskon</span><i class="bi bi-tags"></i></div><div class="value">' + money(totalDiscount) + '</div><div class="hint">Gabungan seluruh komponen</div></article>';
    element('ordersDiscountRows').innerHTML = discountTotals.map(([label, value]) =>
        '<tr><td><strong>' + label + '</strong></td><td class="numeric-cell">' + money(value) + '</td><td class="numeric-cell">' + (totalDiscount ? Math.round(value / totalDiscount * 100) : 0) + '%</td></tr>'
    ).join('') || '<tr><td colspan="3" class="workspace-empty">Belum ada data diskon.</td></tr>';

    const statuses = new Map();
    orderGroups.forEach((order) => {
        const status = order.status || 'Status tidak diketahui';
        const current = statuses.get(status) || { status, orders: 0, items: 0, amount: 0, net: 0 };
        current.orders += 1;
        current.items += order.itemCount;
        current.amount += order.amount;
        current.net += order.netAmount;
        statuses.set(status, current);
    });
    const statusRows = Array.from(statuses.values()).sort((a, b) => b.orders - a.orders);
    element('ordersStatusRows').innerHTML = statusRows.map((status) =>
        '<tr><td><span class="workspace-badge">' + safe(status.status) + '</span></td>' +
            '<td class="numeric-cell">' + count(status.orders) + '</td>' +
            '<td class="numeric-cell">' + count(status.items) + '</td>' +
            '<td class="numeric-cell">' + money(status.amount) + '</td>' +
            '<td class="numeric-cell">' + money(status.net) + '</td>' +
            '<td class="numeric-cell">' + money(status.orders ? Math.round(status.net / status.orders) : 0) + '</td></tr>'
    ).join('') || '<tr><td colspan="6" class="workspace-empty">Belum ada status pesanan.</td></tr>';
    element('ordersStatusCount').textContent = count(statusRows.length) + ' status pesanan';
}

function renderOrders(data) {
    const summary = data.summary;
    const query = state.search.trim().toLowerCase();
    const { start: orderStart, end: orderEnd } = state.ordersDateRange;
    const visible = filterOrders(data.orders, query, state.ordersDateRange);
    const orderGroups = buildOrderGroups(visible);
    const daily = new Map();
    orderGroups.forEach((order) => {
        const rawDate = order.createdAt || '';
        const dateKey = rawDate ? String(rawDate).slice(0, 10) : 'tanpa-tanggal';
        const row = daily.get(dateKey) || { date: rawDate, orders: 0, items: 0, orderAmount: 0, gross: 0, net: 0, sellerDiscount: 0, platformDiscount: 0, paymentDiscount: 0, settled: 0, pending: 0, shipped: 0, delivered: 0 };
        row.orders += 1;
        row.items += order.itemCount;
        row.orderAmount += order.amount;
        row.gross += order.grossAmount;
        row.net += order.netAmount;
        row.sellerDiscount += order.sellerDiscount;
        row.platformDiscount += order.platformDiscount;
        row.paymentDiscount += order.paymentPlatformDiscount;
        if (order.financialStatus === 'credited_to_balance') row.settled += order.netAmount;
        else row.pending += order.netAmount;
        if (order.shippedAt) row.shipped += 1;
        if (order.deliveredAt) row.delivered += 1;
        daily.set(dateKey, row);
    });
    const orderDailySummary = new Map((data.orderDailySummary || []).map((daily) => [
        String(daily.date || 'tanpa-tanggal').slice(0, 10), daily
    ]));
    const hasDateFilter = Boolean(orderStart || orderEnd);
    const matchesOrderDate = (value) => {
        if (!hasDateFilter) return true;
        const key = dateKey(value);
        return Boolean(key) && (!orderStart || key >= orderStart) && (!orderEnd || key <= orderEnd);
    };
    const summaryDailyRows = Array.from(orderDailySummary.entries())
        .filter(([, orderDaily]) => matchesOrderDate(orderDaily.date === 'tanpa-tanggal' ? '' : orderDaily.date))
        .map(([dateKey, orderDaily]) => {
            const visibleRow = daily.get(dateKey) || {};
            return [dateKey, {
                ...visibleRow,
                date: orderDaily.date === 'tanpa-tanggal' ? '' : orderDaily.date,
                orders: Number(orderDaily.order_count || 0),
                items: Number(orderDaily.item_count || 0),
                orderAmount: Number(orderDaily.order_amount || 0),
                gross: Number(orderDaily.gross_amount || 0),
                net: Number(orderDaily.net_amount ?? orderDaily.gross_amount ?? 0),
                sellerDiscount: Number(orderDaily.seller_discount || 0),
                platformDiscount: Number(orderDaily.platform_discount || 0),
                paymentDiscount: Number(orderDaily.payment_platform_discount || 0),
                settled: Number(orderDaily.settled_amount || 0),
                pending: Number(orderDaily.pending_amount || 0),
                shipped: Number(orderDaily.shipped_order_count || 0),
                delivered: Number(orderDaily.delivered_order_count || 0)
            }];
        });
    const hasSearchFilter = Boolean(query);
    const dailyRows = hasSearchFilter
        ? Array.from(daily.entries()).sort(([a], [b]) => b.localeCompare(a))
        : summaryDailyRows.sort(([a], [b]) => b.localeCompare(a));
    const filteredSummaryTotals = summaryDailyRows.reduce((totals, [, row]) => ({
        orders: totals.orders + row.orders,
        items: totals.items + row.items,
        orderAmount: totals.orderAmount + row.orderAmount,
        shipped: totals.shipped + row.shipped,
        delivered: totals.delivered + row.delivered,
        gross: totals.gross + row.gross,
        net: totals.net + row.net
    }), { orders: 0, items: 0, orderAmount: 0, shipped: 0, delivered: 0, gross: 0, net: 0 });
    const orderCount = hasSearchFilter ? orderGroups.length : (hasDateFilter ? filteredSummaryTotals.orders : Number(summary.total_orders || 0));
    const itemCount = hasSearchFilter
        ? orderGroups.reduce((total, order) => total + order.itemCount, 0)
        : (hasDateFilter ? filteredSummaryTotals.items : summaryDailyRows.reduce((total, [, row]) => total + row.items, 0));
    const shippedCount = hasSearchFilter ? orderGroups.filter((order) => order.shippedAt).length : (hasDateFilter ? filteredSummaryTotals.shipped : Number(summary.shipped_packages || 0));
    const deliveredCount = hasSearchFilter ? orderGroups.filter((order) => order.deliveredAt).length : (hasDateFilter ? filteredSummaryTotals.delivered : Number(summary.delivered_packages || 0));
    const grossSales = hasSearchFilter
        ? orderGroups.reduce((total, order) => total + order.grossAmount, 0)
        : (hasDateFilter ? filteredSummaryTotals.gross : orderGroups.reduce((total, order) => total + order.grossAmount, 0));
    const netSales = hasSearchFilter
        ? orderGroups.reduce((total, order) => total + order.netAmount, 0)
        : (hasDateFilter ? filteredSummaryTotals.net : orderGroups.reduce((total, order) => total + order.netAmount, 0));
    const grossAov = orderCount ? grossSales / orderCount : 0;
    const netAov = orderCount ? netSales / orderCount : 0;
    const comparisonRange = state.ordersCompareMode === 'previous' ? previousDateRange(state.ordersDateRange) : null;
    const comparisonVisible = comparisonRange ? filterOrders(data.orders, query, comparisonRange) : [];
    const comparisonGroups = buildOrderGroups(comparisonVisible);
    const comparisonOrderCount = comparisonGroups.length;
    const comparisonItemCount = comparisonGroups.reduce((total, order) => total + order.itemCount, 0);
    const comparisonShippedCount = comparisonGroups.filter((order) => order.shippedAt).length;
    const comparisonDeliveredCount = comparisonGroups.filter((order) => order.deliveredAt).length;
    const comparisonGrossSales = comparisonGroups.reduce((total, order) => total + order.grossAmount, 0);
    const comparisonNetSales = comparisonGroups.reduce((total, order) => total + order.netAmount, 0);
    const orderItemKpiComparison = comparisonRange
        ? '<small class="orders-kpi-comparison orders-kpi-combined-comparison"><span class="orders-kpi-previous">vs ' + count(comparisonOrderCount) + ' order · ' + count(comparisonItemCount) + ' item</span><span>' + comparisonMarkup(orderCount, comparisonOrderCount) + ' · ' + comparisonMarkup(itemCount, comparisonItemCount) + '</span></small>'
        : '';
    const ordersKpiMarkup = [
        '<article class="workspace-kpi"><div class="label"><span>Order &amp; item</span><i class="bi bi-bag-check"></i></div>' +
            '<div class="value orders-kpi-combined"><span>' + count(orderCount) + ' <small>order</small></span><span class="separator">·</span><span>' + count(itemCount) + ' <small>item</small></span></div>' +
            '<div class="hint">AOV bersih ' + (netAov ? money(Math.round(netAov)) : '—') + ' per order' + orderItemKpiComparison + '</div></article>',
        kpi('Paket dikirim', count(shippedCount), 'Sudah punya waktu kirim' + (comparisonRange ? ordersKpiComparison(shippedCount, comparisonShippedCount, count) : ''), 'bi-box-seam'),
        kpi('Paket diterima', count(deliveredCount), 'Sudah punya waktu diterima' + (comparisonRange ? ordersKpiComparison(deliveredCount, comparisonDeliveredCount, count) : ''), 'bi-check2-circle'),
        kpi('Penjualan kotor', money(grossSales), 'Sebelum diskon · AOV ' + (grossAov ? money(Math.round(grossAov)) : '—') + (comparisonRange ? ordersKpiComparison(grossSales, comparisonGrossSales, money) : ''), 'bi-graph-up-arrow'),
        kpi('Penjualan bersih', money(netSales), 'Setelah diskon · AOV ' + (netAov ? money(Math.round(netAov)) : '—') + (comparisonRange ? ordersKpiComparison(netSales, comparisonNetSales, money) : ''), 'bi-cash-stack')
    ].join('');
    element('ordersKpis').innerHTML = ordersKpiMarkup;
    element('ordersAllKpis').innerHTML = ordersKpiMarkup;
    element('ordersDailyRows').innerHTML = dailyRows.map(([dateKey, row]) => {
        return '<tr><td><strong>' + (row.date ? dateLabel(row.date) : 'Tanpa tanggal') + '</strong></td>' +
            ordersCountCell(row.orders) +
            ordersCountCell(row.items) +
            ordersMetricCell(row.gross) +
            ordersMetricCell(row.net) +
            ordersAverageCell(row.net, row.orders) +
            ordersMetricCell(row.orderAmount) +
            ordersAverageCell(row.orderAmount, row.orders) + '</tr>';
    }).join('') || '<tr><td colspan="8" class="workspace-empty">Belum ada data order untuk diringkas.</td></tr>';
    element('ordersResultCount').textContent = count(orderGroups.length) + ' order · ' + count(visible.length) + ' item ditampilkan · ' + count(summary.total_orders) + ' total order';
    element('ordersTableBody').innerHTML = orderGroups.map((order) => {
        const itemLines = order.items.map((item) => '<span class="orders-item-line"><strong>' + safe(item.label) + '</strong></span>').join('');
        const skuLines = order.items.map((item) => '<span class="orders-item-line"><strong>' + safe(item.sku) + '</strong><small>Qty ' + count(item.quantity) + '</small></span>').join('');
        const totalDiscount = order.sellerDiscount + order.platformDiscount + order.paymentPlatformDiscount;
        return '<tr><td>' + dateLabel(order.createdAt) + '</td>' +
        '<td><strong>' + safe(order.orderId) + '</strong><span class="muted-line">' + count(order.itemCount) + ' item</span></td>' +
        '<td class="product-cell">' + itemLines + '</td>' +
        '<td>' + skuLines + '</td>' +
        '<td class="numeric-cell">' + money(order.amount) + '</td>' +
        '<td class="numeric-cell">' + money(order.grossAmount) + '</td>' +
        '<td class="numeric-cell">' + money(order.sellerDiscount) + '</td>' +
        '<td class="numeric-cell">' + money(order.platformDiscount) + '</td>' +
        '<td class="numeric-cell">' + money(order.paymentPlatformDiscount) + '</td>' +
        '<td class="numeric-cell">' + money(totalDiscount) + '</td>' +
        '<td class="numeric-cell">' + money(order.netAmount) + '</td></tr>';
    }).join('') || '<tr><td colspan="11" class="workspace-empty">Tidak ada order yang cocok.</td></tr>';

    element('ordersTabAllCount').textContent = count(visible.length);
    renderOrderAnalysis(orderGroups, visible);
}

function renderShipping(data) {
    const query = state.shippingSearch.trim().toLowerCase();
    const visible = filterShippingOrders(data.orders, query, state.shippingDateRange);
    const orderGroups = buildOrderGroups(visible);
    const daily = new Map();
    orderGroups.forEach((order) => {
        const key = dateKey(order.shippedAt) || 'belum-dikirim';
        const row = daily.get(key) || {
            date: order.shippedAt || '',
            orders: 0,
            items: 0,
            failedShipments: 0,
            failedItems: 0,
            shipped: 0,
            shippedItems: 0,
            delivered: 0,
            deliveredItems: 0,
            awaitingShipment: 0,
            awaitingShipmentItems: 0,
            inTransit: 0,
            inTransitItems: 0
        };
        row.orders += 1;
        row.items += order.itemCount;
        if (isFailedShipment(order)) {
            row.failedShipments += 1;
            row.failedItems += order.itemCount;
        } else {
            if (order.shippedAt) {
                row.shipped += 1;
                row.shippedItems += order.itemCount;
            }
            if (order.deliveredAt) {
                row.delivered += 1;
                row.deliveredItems += order.itemCount;
            }
            if (!order.shippedAt) {
                row.awaitingShipment += 1;
                row.awaitingShipmentItems += order.itemCount;
            }
            if (order.shippedAt && !order.deliveredAt) {
                row.inTransit += 1;
                row.inTransitItems += order.itemCount;
            }
        }
        daily.set(key, row);
    });
    const shippedCount = orderGroups.filter((order) => !isFailedShipment(order) && order.shippedAt).length;
    const deliveredCount = orderGroups.filter((order) => !isFailedShipment(order) && order.deliveredAt).length;
    const awaitingShipmentCount = orderGroups.filter((order) => !isFailedShipment(order) && !order.shippedAt).length;
    const awaitingDeliveryCount = orderGroups.filter((order) => !isFailedShipment(order) && order.shippedAt && !order.deliveredAt).length;
    const failedCount = orderGroups.filter((order) => isFailedShipment(order)).length;
    const shippingTabOrders = {
        pending: orderGroups.filter((order) => !isFailedShipment(order) && !order.shippedAt),
        'in-transit': orderGroups.filter((order) => !isFailedShipment(order) && order.shippedAt && !order.deliveredAt),
        completed: orderGroups.filter((order) => !isFailedShipment(order) && order.deliveredAt),
        failed: orderGroups.filter((order) => isFailedShipment(order)),
        all: orderGroups
    };
    const selectedShippingOrders = state.shippingTab === 'overview'
        ? orderGroups
        : (shippingTabOrders[state.shippingTab] || orderGroups);
    const shippingTabLabels = {
        pending: 'Menunggu dikirim',
        'in-transit': 'Sedang dikirim',
        completed: 'Selesai',
        failed: 'Gagal / Retur',
        all: 'Semua pengiriman'
    };

    element('shippingKpis').innerHTML = [
        kpi('Total order', count(orderGroups.length), 'Order yang cocok dengan filter', 'bi-bag'),
        kpi('Sudah dikirim', count(shippedCount), 'Sudah punya waktu kirim', 'bi-box-seam'),
        kpi('Sudah diterima', count(deliveredCount), 'Sudah punya waktu diterima', 'bi-check2-circle'),
        kpi('Menunggu dikirim', count(awaitingShipmentCount), 'Belum ada waktu kirim', 'bi-hourglass-split'),
        kpi('Dalam perjalanan', count(awaitingDeliveryCount), 'Sudah dikirim, belum diterima', 'bi-truck')
    ].join('');
    element('shippingTabPendingCount').textContent = count(awaitingShipmentCount);
    element('shippingTabInTransitCount').textContent = count(awaitingDeliveryCount);
    element('shippingTabCompletedCount').textContent = count(deliveredCount);
    element('shippingTabFailedCount').textContent = count(failedCount);
    element('shippingTabAllCount').textContent = count(orderGroups.length);
    const selectedItemCount = selectedShippingOrders.reduce((total, order) => total + order.itemCount, 0);
    element('shippingControlTitle').textContent = shippingTabLabels[state.shippingTab] || 'Semua pengiriman';
    element('shippingResultCount').textContent = count(selectedShippingOrders.length) + ' order · ' + count(selectedItemCount) + ' item ditampilkan';
    const dailyRows = Array.from(daily.entries()).sort(([a], [b]) => {
        if (a === 'belum-dikirim') return 1;
        if (b === 'belum-dikirim') return -1;
        return b.localeCompare(a);
    });
    const shippingSummaryCell = (orders, items, tone = '') =>
        '<td class="numeric-cell shipping-summary-cell ' + tone + '"><strong>' + count(orders) + ' order</strong><small>' + count(items) + ' item</small></td>';
    const shippingProgressCell = (row) => {
        const activeOrders = Math.max(row.orders - row.failedShipments, 0);
        const progress = activeOrders
            ? Math.min(100, Math.round(((row.delivered + (row.inTransit * 0.5)) / activeOrders) * 100))
            : 0;
        const progressTone = progress >= 100 ? ' is-complete' : progress > 0 ? ' is-active' : '';
        return '<td class="shipping-progress-cell" title="Progress pengiriman: ' + progress + '%">' +
            '<div class="shipping-progress-meta"><strong>' + progress + '%</strong><small>' + count(row.delivered) + ' diterima</small></div>' +
            '<div class="shipping-progress' + progressTone + '" role="progressbar" aria-label="Progress pengiriman ' + progress + '%" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progress + '"><span style="width:' + progress + '%"></span></div>' +
            '</td>';
    };
    element('shippingDailyRows').innerHTML = dailyRows.map(([, row]) =>
        '<tr><td><strong>' + (row.date ? dateLabel(row.date) : 'Belum dikirim') + '</strong></td>' +
        shippingProgressCell(row) +
        shippingSummaryCell(row.orders, row.items) +
        shippingSummaryCell(row.awaitingShipment, row.awaitingShipmentItems, 'warning-value') +
        shippingSummaryCell(row.shipped, row.shippedItems) +
        shippingSummaryCell(row.delivered, row.deliveredItems, 'settlement-value') +
        shippingSummaryCell(row.failedShipments, row.failedItems, 'warning-value') + '</tr>'
    ).join('') || '<tr><td colspan="8" class="workspace-empty">Belum ada data pengiriman untuk diringkas.</td></tr>';
    element('shippingRows').innerHTML = selectedShippingOrders.map((order) =>
        '<tr><td><strong>' + safe(order.orderId) + '</strong><span class="muted-line">' + dateLabel(order.createdAt) + '</span></td>' +
        '<td class="product-cell"><strong>' + safe(order.products.slice(0, 2).join(' · ')) + '</strong>' + (order.products.length > 2 ? '<small>+' + count(order.products.length - 2) + ' item lain</small>' : '') + '</td>' +
        '<td>' + shippingBadge(order) + '</td>' +
        '<td>' + safe(order.tracking) + '<span class="muted-line">' + safe(order.courier) + '</span></td>' +
        '<td>' + dateLabel(order.shippedAt) + '</td><td>' + dateLabel(order.deliveredAt) + '</td><td>' + financeBadge(order.financialStatus) + '</td></tr>'
    ).join('') || '<tr><td colspan="7" class="workspace-empty">Belum ada data pengiriman.</td></tr>';
}

function renderFinance(data) {
    const summary = data.summary;
    const netSettlement = Number(summary.order_settlement) + Number(summary.other_settlement);
    const allOrderTransactions = (data.transactions || []).filter((transaction) => transaction.transactionType === 'Pesanan');
    const shipmentGrossSales = (data.orderDailySummary || []).reduce((total, daily) => total + Number(daily.gross_amount || 0), 0);
    const shipmentNetSales = (data.orderDailySummary || []).reduce((total, daily) => total + Number(daily.net_amount ?? daily.gross_amount ?? 0), 0);
    const grossSales = allOrderTransactions.length
        ? allOrderTransactions.reduce((total, transaction) => total + transactionGrossSales(transaction), 0)
        : shipmentGrossSales;
    const netSales = allOrderTransactions.length
        ? allOrderTransactions.reduce((total, transaction) => total + transactionNetSales(transaction), 0)
        : shipmentNetSales;
    element('financeKpis').innerHTML = [
        kpi('Order tercatat', count(summary.total_orders), 'Order dari data transaksi dan pengiriman', 'bi-bag-check'),
        kpi('Transaksi keuangan', count(summary.transaction_count), 'Baris dari laporan transaksi', 'bi-journal-text'),
        kpi('Penjualan kotor', money(grossSales), 'Sebelum diskon · data order', 'bi-graph-up-arrow'),
        kpi('Total biaya', money(summary.total_fees), 'Dari laporan transaksi', 'bi-receipt'),
        kpi('Dana bersih', signedMoney(netSettlement), 'Dari pencairan dan penyesuaian', 'bi-wallet2')
    ].join('');

    const query = state.financeSearch.trim().toLowerCase();
    const matchingTransactions = (data.transactions || []).filter((transaction) => {
        const matchesQuery = [transaction.externalReferenceId, transaction.transactionType, transaction.orderId, transaction.creditedOn, transaction.orderedOn, transaction.tracking, transaction.courier]
            .some((value) => String(value || '').toLowerCase().includes(query));
        if (!matchesQuery) return false;
        return financeDateMatches(transaction.orderedOn || transaction.creditedOn || transaction.shippedAt || transaction.deliveredAt);
    });
    const typeCounts = new Map();
    matchingTransactions.forEach((transaction) => {
        const type = transaction.transactionType || 'Tanpa jenis';
        typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    });
    const typeOptions = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1]);
    const matchedTransactions = matchingTransactions.filter((transaction) =>
        transaction.transactionType === 'Pesanan' && Boolean(transaction.orderId)
    );
    const unmatchedTransactions = matchingTransactions.filter((transaction) =>
        transaction.transactionType === 'Pesanan' && !transaction.orderId
    );
    const returnTransactions = matchingTransactions.filter((transaction) =>
        Number(transaction.refundAfterDiscount || 0) !== 0
    );
    const adTransactions = matchingTransactions.filter((transaction) =>
        transaction.transactionType === 'Pembayaran GMV untuk Iklan TikTok'
    );
    const dailySummary = new Map();
    const getDaily = (rawDate) => {
        const dateKey = rawDate ? String(rawDate).slice(0, 10) : 'tanpa-tanggal';
        if (!dailySummary.has(dateKey)) {
            dailySummary.set(dateKey, {
                date: rawDate,
                orders: 0,
                settledOrders: 0,
                pendingOrders: 0,
                grossSales: 0,
                netSales: 0,
                totalFees: 0,
                settledIncome: 0,
                pendingIncome: 0,
                returnAmount: 0,
                failedShipments: 0
            });
        }
        return dailySummary.get(dateKey);
    };
    matchingTransactions.forEach((transaction) => {
        const rawDate = transactionSummaryDate(transaction);
        const daily = getDaily(rawDate);
        const gross = transactionGrossSales(transaction);
        const net = transactionNetSales(transaction);
        const fees = Number(transaction.totalFees || 0);
        const settlement = Number(transaction.settlementAmount || 0);
        const isOrder = transaction.transactionType === 'Pesanan';
        const isSettled = Boolean(transaction.creditedOn || transaction.financialStatus === 'credited_to_balance');
        daily.totalFees += fees || (transaction.transactionType === 'Pembayaran GMV untuk Iklan TikTok' ? settlement : 0);
        daily.returnAmount += Math.abs(Number(transaction.refundAfterDiscount || 0));
        if (isOrder) {
            daily.orders += 1;
            daily.grossSales += gross;
            daily.netSales += net;
            if (isSettled) {
                daily.settledOrders += 1;
                daily.settledIncome += settlement;
            } else {
                daily.pendingOrders += 1;
                daily.pendingIncome += net;
            }
        }
    });
    const reportedOrderIds = new Set(matchingTransactions.map((transaction) => transaction.orderId).filter(Boolean));
    const reportedReferences = new Set(matchingTransactions.map((transaction) => transaction.externalReferenceId).filter(Boolean));
    const pendingOrders = new Map();
    (data.orders || []).filter((order) => order.financialStatus === 'not_reported' && !reportedOrderIds.has(order.orderId) && !reportedReferences.has(order.orderId) && financeDateMatches(order.createdAt)).forEach((order, index) => {
        const key = String(order.orderId || 'pending-' + index);
        const current = pendingOrders.get(key) || { date: order.createdAt || '', gross: 0, net: 0, hasDetailedAmounts: false };
        if (order.subtotalBeforeDiscount !== null && order.subtotalBeforeDiscount !== undefined) {
            current.gross += Number(order.subtotalBeforeDiscount || 0);
            current.net += Number(order.subtotalAfterDiscount ?? order.subtotalBeforeDiscount ?? 0);
            current.hasDetailedAmounts = true;
        } else if (!current.hasDetailedAmounts) {
            current.gross = Number(order.amount || 0);
            current.net = Number(order.amount || 0);
        }
        pendingOrders.set(key, current);
    });
    pendingOrders.forEach((order) => {
        const daily = getDaily(order.date);
        daily.orders += 1;
        daily.pendingOrders += 1;
        daily.grossSales += order.gross;
        daily.netSales += order.net;
        daily.pendingIncome += order.net;
    });
    (data.orders || []).filter((order) => isFailedShipment(order) && financeDateMatches(order.createdAt)).forEach((order) => {
        const rawDate = order.createdAt || '';
        const daily = getDaily(rawDate);
        daily.failedShipments += 1;
    });
    const orderDailySummary = new Map((data.orderDailySummary || []).map((daily) => [
        String(daily.date || 'tanpa-tanggal').slice(0, 10), daily
    ]));
    orderDailySummary.forEach((orderDaily, dateKey) => {
        if (!financeDateMatches(orderDaily.date === 'tanpa-tanggal' ? '' : orderDaily.date)) return;
        if (dailySummary.has(dateKey)) return;
        dailySummary.set(dateKey, {
            date: orderDaily.date === 'tanpa-tanggal' ? '' : orderDaily.date,
            orders: Number(orderDaily.order_count || 0),
            settledOrders: Number(orderDaily.settled_order_count || 0),
            pendingOrders: Number(orderDaily.pending_order_count || 0),
            grossSales: Number(orderDaily.gross_amount || 0),
            netSales: Number(orderDaily.net_amount ?? orderDaily.gross_amount ?? 0),
            totalFees: 0,
            settledIncome: 0,
            pendingIncome: Number(orderDaily.pending_amount || 0),
            returnAmount: 0,
            failedShipments: 0
        });
    });
    dailySummary.forEach((daily, dateKey) => {
        const orderDaily = orderDailySummary.get(dateKey);
        const shipmentOrders = Number(orderDaily?.order_count || 0);
        const shipmentSettledOrders = Number(orderDaily?.settled_order_count || 0);
        const shipmentPendingOrders = Number(orderDaily?.pending_order_count || 0);
        daily.orders = shipmentOrders || daily.orders;
        daily.settledOrders = shipmentSettledOrders || daily.settledOrders;
        daily.pendingOrders = shipmentPendingOrders || daily.pendingOrders;
    });
    element('financeDailyRows').innerHTML = Array.from(dailySummary.entries())
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([, daily]) =>
            '<tr><td><strong>' + (daily.date ? dateLabel(daily.date) : 'Tanpa tanggal') + '</strong></td>' +
            '<td class="numeric-cell">' + count(daily.orders) + '</td>' +
            '<td class="numeric-cell settlement-value">' + count(daily.settledOrders) + '</td>' +
            '<td class="numeric-cell warning-value">' + count(daily.pendingOrders) + '</td>' +
            '<td class="numeric-cell">' + signedMoney(daily.grossSales) + '</td>' +
            '<td class="numeric-cell">' + signedMoney(daily.netSales) + '</td>' +
            '<td class="numeric-cell negative-value">' + signedMoney(-Math.abs(daily.totalFees)) + '</td>' +
            '<td class="numeric-cell settlement-value">' + signedMoney(daily.settledIncome) + '</td>' +
            '<td class="numeric-cell warning-value">' + signedMoney(daily.pendingIncome) + '</td>' +
            '<td class="numeric-cell warning-value">' + money(daily.returnAmount) + '</td>' +
            '<td class="numeric-cell warning-value">' + count(Math.max(daily.failedShipments, 0)) + '</td></tr>'
        ).join('') || '<tr><td colspan="11" class="workspace-empty">Belum ada ringkasan harian.</td></tr>';
    const orderedTypeOptions = typeOptions.filter(([type]) => type !== 'Pesanan' && type !== 'Pembayaran GMV untuk Iklan TikTok');
    element('financeTypeTabs').innerHTML = [
        '<button type="button" class="finance-type-tab finance-type-tab-warning' + (state.financeTypeFilter === 'unmatched' ? ' active' : '') + '" data-finance-type="unmatched" role="tab" aria-selected="' + (state.financeTypeFilter === 'unmatched') + '">Belum ada di data kirim <em>' + count(unmatchedTransactions.length) + '</em></button>',
        '<button type="button" class="finance-type-tab' + (state.financeTypeFilter === 'Pesanan' ? ' active' : '') + '" data-finance-type="Pesanan" role="tab" aria-selected="' + (state.financeTypeFilter === 'Pesanan') + '">Pesanan cocok <em>' + count(matchedTransactions.length) + '</em></button>',
        '<button type="button" class="finance-type-tab' + (state.financeTypeFilter === 'returns' ? ' active' : '') + '" data-finance-type="returns" role="tab" aria-selected="' + (state.financeTypeFilter === 'returns') + '">Pengembalian <em>' + count(returnTransactions.length) + '</em></button>',
        ...orderedTypeOptions.map(([type, total]) => '<button type="button" class="finance-type-tab' + (state.financeTypeFilter === type ? ' active' : '') + '" data-finance-type="' + escapeHtml(type) + '" role="tab" aria-selected="' + (state.financeTypeFilter === type) + '">' + safe(displayTransactionType(type)) + ' <em>' + count(total) + '</em></button>'),
        '<button type="button" class="finance-type-tab' + (state.financeTypeFilter === 'all' ? ' active' : '') + '" data-finance-type="all" role="tab" aria-selected="' + (state.financeTypeFilter === 'all') + '">Semua transaksi <em>' + count(matchingTransactions.length) + '</em></button>'
    ].join('');
    const uploadHint = element('financeUploadHint');
    if (uploadHint) {
        const uploadDates = Array.from(new Set(unmatchedTransactions
            .map((transaction) => String(transaction.orderedOn || '').slice(0, 10))
            .filter((value) => value && value !== 'undefined')))
            .sort((a, b) => b.localeCompare(a));
        const uploadDateRanges = financeUploadDateRanges(uploadDates);
        uploadHint.hidden = state.financeTypeFilter !== 'unmatched';
        uploadHint.innerHTML = state.financeTypeFilter === 'unmatched'
            ? '<i class="bi bi-info-circle"></i><span>Upload data kirim untuk range tanggal order: ' +
                (uploadDateRanges.length
                    ? uploadDateRanges.join('<span class="finance-upload-date-separator">; </span>')
                    : '<strong>Tanggal belum tersedia</strong>') +
                '.</span>'
            : '';
    }
    const transactions = state.financeTypeFilter === 'all'
        ? matchingTransactions
        : state.financeTypeFilter === 'unmatched'
            ? unmatchedTransactions
            : state.financeTypeFilter === 'returns'
                ? returnTransactions
            : state.financeTypeFilter === 'Pesanan'
                ? matchedTransactions
                : matchingTransactions.filter((transaction) => (transaction.transactionType || 'Tanpa jenis') === state.financeTypeFilter);
    const activeTypeLabel = state.financeTypeFilter === 'all' ? 'Semua transaksi' : state.financeTypeFilter === 'unmatched' ? 'Belum ada di data kirim' : state.financeTypeFilter === 'returns' ? 'Pengembalian' : state.financeTypeFilter === 'Pesanan' ? 'Pesanan cocok' : displayTransactionType(state.financeTypeFilter);
    element('financeTransactionCount').textContent = count(transactions.length) + ' transaksi · ' + activeTypeLabel;
    const sumTransactionField = (field) => transactions.reduce((total, transaction) => total + Number(transaction[field] || 0), 0);
    const visibleRevenue = sumTransactionField('totalRevenue');
    const visibleGrossSales = transactions.filter((transaction) => transaction.transactionType === 'Pesanan').reduce((total, transaction) => total + transactionGrossSales(transaction), 0);
    const visibleNetSales = transactions.filter((transaction) => transaction.transactionType === 'Pesanan').reduce((total, transaction) => total + transactionNetSales(transaction), 0);
    const visibleFees = Math.abs(sumTransactionField('totalFees'));
    const visibleSettlement = sumTransactionField('settlementAmount');
    const visibleFeeRate = percentage(visibleFees, visibleGrossSales);
    element('financeLedgerKpis').innerHTML = [
        kpi('Transaksi ditampilkan', count(transactions.length), 'Mengikuti pencarian dan filter aktif', 'bi-list-check'),
        kpi('Penjualan kotor', money(visibleGrossSales), 'Sebelum diskon', 'bi-graph-up-arrow'),
        kpi('Penjualan bersih', money(visibleNetSales), 'Setelah diskon dan retur', 'bi-cash-stack'),
        kpi('Total biaya', money(visibleFees), visibleFeeRate ? visibleFeeRate + ' dari penjualan kotor' : 'Belum ada penjualan', 'bi-receipt'),
        kpi('Dana bersih', signedMoney(visibleSettlement), 'Setelah biaya dan pengembalian', 'bi-wallet2')
    ].join('');
    const feeBreakdown = [
        ['Komisi platform', Math.abs(sumTransactionField('platformCommission')), 'bi-building'],
        ['Layanan logistik', Math.abs(sumTransactionField('logisticsServiceFee')), 'bi-box-seam'],
        ['Biaya pengiriman', Math.abs(sumTransactionField('shippingFee')), 'bi-truck']
    ];
    const categorizedFees = feeBreakdown.reduce((total, [, amount]) => total + amount, 0);
    feeBreakdown.push(['Biaya lainnya', Math.max(visibleFees - categorizedFees, 0), 'bi-three-dots']);
    element('financeFeeBreakdown').innerHTML = feeBreakdown.map(([label, amount, icon]) => {
        const share = percentage(amount, visibleGrossSales);
        return '<div><i class="bi ' + icon + '"></i><span><strong>' + label + '</strong><small>' + (share ? share + ' dari total penjualan' : 'Belum ada penjualan') + '</small></span><b>' + money(amount) + '</b></div>';
    }
    ).join('') || '<div class="workspace-empty">Belum ada rincian biaya.</div>';
    const otherFeeTotals = new Map();
    transactions.forEach((transaction) => {
        otherFeeDetails(transaction).forEach(([label, amount]) => {
            otherFeeTotals.set(label, (otherFeeTotals.get(label) || 0) + amount);
        });
    });
    element('financeOtherFeeDetails').innerHTML = Array.from(otherFeeTotals.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([label, amount]) => '<div><span><strong>' + label + '</strong><small>' + (percentage(amount, visibleGrossSales) || '—') + ' dari penjualan kotor</small></span><b>' + money(amount) + '</b></div>')
        .join('') || '<div class="workspace-empty">Tidak ada komponen biaya lainnya.</div>';
    const orderDetails = financeOrderDetails(data.orders);
    const selectedStoreName = (data.stores || []).find((store) => String(store.id) === String(data.selectedStoreId))?.name || '';
    const adCost = adTransactions.reduce((total, transaction) => total + Math.abs(Number(transaction.settlementAmount || 0)), 0);
    element('financeTabAdsCount').textContent = count(adTransactions.length);
    element('financeAdsCount').textContent = count(adTransactions.length) + ' transaksi biaya iklan';
    element('financeAdsKpis').innerHTML = [
        kpi('Transaksi iklan', count(adTransactions.length), 'Berdasarkan pencarian aktif', 'bi-megaphone'),
        kpi('Total biaya iklan', money(adCost), 'Dana yang dibebankan ke saldo', 'bi-receipt-cutoff'),
        kpi('Rata-rata transaksi', money(adTransactions.length ? adCost / adTransactions.length : 0), 'Rata-rata biaya per transaksi', 'bi-calculator'),
        kpi('% dari penjualan', percentage(adCost, grossSales) || '—', 'Dibandingkan penjualan kotor', 'bi-percent')
    ].join('');
    element('financeAdsRows').innerHTML = adTransactions.map((transaction) => {
        return '<tr>' +
            transactionDateCell(transaction, selectedStoreName) +
            transactionReferenceCell(transaction) +
            transactionFinanceCell(transaction) +
            transactionFeeDetailsCell(transaction) +
        '</tr>';
    }).join('') || '<tr><td colspan="4" class="workspace-empty">Belum ada biaya iklan yang cocok dengan pencarian.</td></tr>';
    const ledgerEmptyMessage = (data.transactions || []).length
        ? 'Belum ada transaksi pada filter ini.'
        : 'Belum ada laporan transaksi. Import laporan transaksi untuk melihat biaya dan dana cair.';
    element('financeOrderRows').innerHTML = transactions.map((transaction) => {
        return '<tr>' +
            transactionDateCell(transaction, selectedStoreName) +
            transactionReferenceCell(transaction) +
            transactionItemsCells(transaction, orderDetails) +
            transactionFinanceCell(transaction) +
            transactionFeeDetailsCell(transaction) +
        '</tr>';
    }).join('') || '<tr><td colspan="6" class="workspace-empty">' + ledgerEmptyMessage + '</td></tr>';

    const shipmentTransactions = transactions.filter((transaction) => transaction.orderId);
    element('financeShipmentCount').textContent = count(shipmentTransactions.length) + ' transaksi order terkait pengiriman';
    element('financeShipmentRows').innerHTML = shipmentTransactions.map((transaction) =>
        '<tr>' +
            '<td><strong>' + safe(transaction.orderId) + '</strong><span class="muted-line">Ref ' + safe(transaction.externalReferenceId) + '</span></td>' +
            '<td>' + transactionShippingBadge(transaction) + '<span class="muted-line">' + (transaction.tracking ? safe(transaction.tracking) : 'Resi belum tersedia') + '</span><span class="muted-line">' + (transaction.courier ? safe(transaction.courier) : 'Kurir belum tersedia') + '</span></td>' +
            '<td>' + dateLabel(transaction.shippedAt) + '</td>' +
            '<td>' + dateLabel(transaction.deliveredAt) + '</td>' +
            '<td class="numeric-cell settlement-value">' + ledgerAmount(transaction.settlementAmount) + '</td>' +
            '<td>' + transactionBadge(transaction) + '</td>' +
        '</tr>'
    ).join('') || '<tr><td colspan="6" class="workspace-empty">Belum ada order terkait pengiriman yang cocok.</td></tr>';

    element('financeTabLedgerCount').textContent = count(matchingTransactions.length);
    element('financeTabShipmentCount').textContent = count(shipmentTransactions.length);
    element('financeTabTransferCount').textContent = count((data.transfers || []).length);
    element('financeTabControlCount').textContent = count(Number(summary.pending_orders || 0) + Number(summary.unmatched_orders || 0));
    element('financeTabControlCount').setAttribute('aria-label', 'Perlu dicek ' + count(Number(summary.pending_orders || 0) + Number(summary.unmatched_orders || 0)));

    element('financeTransferRows').innerHTML = (data.transfers || []).slice(0, 8).map((transfer) =>
        '<tr><td><strong>' + dateLabel(transfer.completedOn || transfer.requestedOn) + '</strong><span class="muted-line">' + safe(transfer.externalReferenceId) + '</span></td>' +
        '<td>' + safe(transfer.transferType) + '</td>' +
        '<td class="numeric-cell settlement-value">' + ledgerAmount(transfer.amount) + '</td>' +
        '<td>' + (transfer.status === 'Transferred' ? '<span class="workspace-badge success">Selesai</span>' : '<span class="workspace-badge">' + safe(transfer.status) + '</span>') + '</td></tr>'
    ).join('') || '<tr><td colspan="4" class="workspace-empty">Belum ada data transfer.</td></tr>';

    element('financeAttention').innerHTML =
        '<div><strong>' + count(summary.pending_orders) + ' pesanan menunggu dana</strong><small>Belum ada catatan uang masuk dari laporan keuangan.</small></div>' +
        '<div><strong>' + count(summary.unmatched_orders) + ' pesanan belum ada di data kirim</strong><small>Nomor pesanan belum ditemukan di data pengiriman.</small></div>' +
        '<div><strong>' + count(summary.transfer_count) + ' catatan transfer</strong><small>Riwayat uang yang bergerak ke atau dari saldo toko.</small></div>';
}

function renderWorkspace() {
    if (!state.data) return;
    renderDashboard(state.data);
    renderOrders(state.data);
    renderShipping(state.data);
    renderFinance(state.data);
}

async function loadWorkspace(storeId = null) {
    const notice = element('workspaceNotice');
    notice.classList.remove('error');
    notice.innerHTML = '<i class="bi bi-arrow-repeat"></i><span>Memuat data dari database…</span>';
    try {
        const response = await fetch('/api/workspace' + (storeId ? '?storeId=' + encodeURIComponent(storeId) : ''));
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Data tidak tersedia.');
        state.data = data;
        document.querySelectorAll('[data-workspace-store]').forEach((selector) => {
            selector.innerHTML = data.stores.map((store) => '<option value="' + store.id + '">' + safe(store.name) + '</option>').join('') || '<option value="">Belum ada toko</option>';
            selector.value = String(data.selectedStoreId ?? '');
        });
        element('backendStatus').classList.remove('offline');
        element('backendStatus').innerHTML = '<i class="bi bi-circle-fill"></i> Database aktif';
        ['workspaceOrdersError', 'workspaceShippingError', 'workspaceFinanceError'].forEach((id) => { element(id).hidden = true; });
        notice.innerHTML = '<i class="bi bi-database-check"></i><span>Data database untuk <strong>' +
            safe(data.stores.find((store) => store.id === data.selectedStoreId)?.name || 'toko') +
            '</strong>. Preview impor di browser belum mengubah angka di sini.</span>';
        renderWorkspace();
    } catch (error) {
        state.data = null;
        element('backendStatus').classList.add('offline');
        element('backendStatus').innerHTML = '<i class="bi bi-circle-fill"></i> Database offline';
        notice.classList.add('error');
        notice.innerHTML = '<i class="bi bi-exclamation-triangle"></i><span>' + safe(error.message) +
            ' Jalankan backend lokal agar dashboard dapat membaca database.</span>';
        ['dashboardKpis', 'ordersKpis', 'ordersAllKpis', 'ordersDiscountKpis', 'shippingKpis', 'financeKpis'].forEach((id) => { element(id).innerHTML = ''; });
        ['dashboardOrderRows', 'dashboardImportRows', 'ordersTableBody', 'ordersDailyRows', 'ordersProductRows', 'ordersDiscountRows', 'ordersStatusRows', 'shippingDailyRows', 'shippingRows', 'financeOrderRows', 'financeDailyRows', 'financeShipmentRows', 'financeLedgerKpis', 'financeFeeBreakdown', 'financeOtherFeeDetails', 'financeReturnKpis', 'financeReturnRows', 'financeTransferRows', 'financeAttention'].forEach((id) => {
            element(id).innerHTML = '';
        });
        ['workspaceOrdersError', 'workspaceShippingError', 'workspaceFinanceError'].forEach((id) => {
            element(id).hidden = false;
            element(id).textContent = 'Database belum tersedia. Jalankan backend lokal lalu muat ulang halaman.';
        });
    }
}

export function setupWorkspace() {
    document.querySelectorAll('[data-finance-tab]').forEach((button) => {
        button.addEventListener('click', () => setFinanceTab(button.dataset.financeTab));
    });
    setFinanceTab();
    document.querySelectorAll('[data-orders-tab]').forEach((button) => {
        button.addEventListener('click', () => setOrdersTab(button.dataset.ordersTab));
    });
    setOrdersTab();
    const ordersCompareMode = element('ordersCompareMode');
    if (ordersCompareMode) {
        ordersCompareMode.value = state.ordersCompareMode;
        ordersCompareMode.addEventListener('change', (event) => {
            state.ordersCompareMode = ordersCompareModes.has(event.target.value) ? event.target.value : 'previous';
            try {
                window.localStorage.setItem(ordersCompareModeStorageKey, state.ordersCompareMode);
            } catch {
                // Storage can be unavailable in a restricted browser context.
            }
            if (state.data) renderOrders(state.data);
        });
    }
    document.querySelectorAll('[data-shipping-tab]').forEach((button) => {
        button.addEventListener('click', () => setShippingTab(button.dataset.shippingTab));
    });
    setShippingTab();
    element('financeTypeTabs').addEventListener('click', (event) => {
        const button = event.target.closest('[data-finance-type]');
        if (!button) return;
        state.financeTypeFilter = button.dataset.financeType;
        if (state.data) renderFinance(state.data);
    });
    document.querySelectorAll('[data-workspace-store]').forEach((selector) => {
        selector.addEventListener('change', (event) => loadWorkspace(event.target.value));
    });
    const ordersSearch = element('ordersSearch');
    if (ordersSearch) ordersSearch.addEventListener('input', (event) => {
        state.search = event.target.value;
        if (state.data) renderOrders(state.data);
    });
    const ordersDateRange = element('ordersDateRange');
    ordersDateRange?.addEventListener('flatpickrchange', (event) => {
        const selectedDates = event.detail?.selectedDates || [];
        if (selectedDates.length === 2) {
            state.ordersDateRange = {
                start: dateKey(selectedDates[0]),
                end: dateKey(selectedDates[1])
            };
        } else if (!selectedDates.length) {
            state.ordersDateRange = { start: '', end: '' };
        }
        if (state.data) renderOrders(state.data);
    });
    const shippingSearch = element('shippingSearch');
    if (shippingSearch) shippingSearch.addEventListener('input', (event) => {
        state.shippingSearch = event.target.value;
        if (state.data) renderShipping(state.data);
    });
    const shippingDateRange = element('shippingDateRange');
    shippingDateRange?.addEventListener('flatpickrchange', (event) => {
        const selectedDates = event.detail?.selectedDates || [];
        if (selectedDates.length === 2) {
            state.shippingDateRange = {
                start: dateKey(selectedDates[0]),
                end: dateKey(selectedDates[1])
            };
        } else if (!selectedDates.length) {
            state.shippingDateRange = { start: '', end: '' };
        }
        if (state.data) renderShipping(state.data);
    });
    const financeSearch = element('financeSearch');
    if (financeSearch) financeSearch.addEventListener('input', (event) => {
        state.financeSearch = event.target.value;
        if (state.data) renderFinance(state.data);
    });
    const financeDateRange = element('financeDateRange');
    financeDateRange?.addEventListener('flatpickrchange', (event) => {
        const selectedDates = event.detail?.selectedDates || [];
        if (selectedDates.length === 2) {
            state.financeDateRange = {
                start: dateKey(selectedDates[0]),
                end: dateKey(selectedDates[1])
            };
        } else if (!selectedDates.length) {
            state.financeDateRange = { start: '', end: '' };
        }
        if (state.data) renderFinance(state.data);
    });
    initDatePickers();
    const defaultRange = defaultCurrentMonthDateRange();
    if (ordersDateRange?._flatpickr) {
        ordersDateRange._flatpickr.setDate([defaultRange.start, defaultRange.end], false);
        state.ordersDateRange = defaultRange;
    }
    if (shippingDateRange?._flatpickr) {
        shippingDateRange._flatpickr.setDate([defaultRange.start, defaultRange.end], false);
        state.shippingDateRange = defaultRange;
    }
    const ordersPickerInput = ordersDateRange?.parentElement?.querySelector('.form-control');
    ordersPickerInput?.addEventListener('input', () => {
        const [start = '', end = ''] = dateKeysFromFlatpickrValue(ordersPickerInput.value);
        state.ordersDateRange = { start, end };
        if (state.data) renderOrders(state.data);
    });
    ordersPickerInput?.addEventListener('change', () => {
        const [start = '', end = ''] = dateKeysFromFlatpickrValue(ordersPickerInput.value);
        state.ordersDateRange = { start, end };
        if (state.data) renderOrders(state.data);
    });
    const shippingPickerInput = shippingDateRange?.parentElement?.querySelector('.form-control');
    shippingPickerInput?.addEventListener('input', () => {
        const [start = '', end = ''] = dateKeysFromFlatpickrValue(shippingPickerInput.value);
        state.shippingDateRange = { start, end };
        if (state.data) renderShipping(state.data);
    });
    shippingPickerInput?.addEventListener('change', () => {
        const [start = '', end = ''] = dateKeysFromFlatpickrValue(shippingPickerInput.value);
        state.shippingDateRange = { start, end };
        if (state.data) renderShipping(state.data);
    });
    loadWorkspace();
}

export function refreshWorkspace() {
    return loadWorkspace(state.data?.selectedStoreId ?? null);
}
